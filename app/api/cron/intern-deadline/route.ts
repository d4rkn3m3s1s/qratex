import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cron-auth';
import { readCronDeadline, sendWithRetry } from '@/lib/cron-delivery';
import { trDateParts, trDayKey } from '@/lib/cron-time';
import { sendTransactionalEmail, isMailConfigured } from '@/lib/mail-sender';
import { escapeEmailHtml } from '@/lib/security/escape-html';
import {
  getInternTaskEmails,
  formatDeadlineLabel,
  renderSimpleBrandedEmail,
  deadlineIsToday,
} from '@/lib/intern-task-emails';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Idempotent bayrak anahtarı (bu gün için hangi şablon/alıcıya hatırlatma gitti). */
const SENT_FLAG_KEY = 'intern_deadline_reminder_sent';

/** Doğrudan çağrıda (orkestratör başlığı yoksa) kullanılacak bütçe. */
const FALLBACK_BUDGET_MS = 45_000;

interface SentFlag {
  dayKey: string;
  /** Bütün alıcılarına ulaşılmış şablonlar. */
  templateIds: string[];
  /** Şablon başına başarıyla gönderilen alıcılar (kısmi başarıda yalnız kalanlar yeniden denenir). */
  recipients: Record<string, string[]>;
}

function readFlag(raw: unknown, dayKey: string): SentFlag {
  const empty: SentFlag = { dayKey, templateIds: [], recipients: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const o = raw as Partial<SentFlag>;
  if (o.dayKey !== dayKey) return empty;
  const recipients: Record<string, string[]> = {};
  if (o.recipients && typeof o.recipients === 'object' && !Array.isArray(o.recipients)) {
    for (const [k, v] of Object.entries(o.recipients)) {
      if (Array.isArray(v)) recipients[k] = v.filter((x): x is string => typeof x === 'string');
    }
  }
  return {
    dayKey,
    templateIds: Array.isArray(o.templateIds) ? o.templateIds.filter((x): x is string => typeof x === 'string') : [],
    recipients,
  };
}

async function writeFlag(flag: SentFlag): Promise<void> {
  const value = flag as unknown as Prisma.InputJsonValue;
  await prisma.settings.upsert({
    where: { key: SENT_FLAG_KEY },
    update: { value, category: 'email' },
    create: { key: SENT_FLAG_KEY, value, category: 'email' },
  });
}

/**
 * Günlük (`/api/cron/daily` içinden). Son teslim tarihi (şablonun kendi `deadline`'ı) BUGÜN olan
 * görev şablonlarının alıcılarına "görev bugün bitiyor" hatırlatma maili atar.
 *
 * Teslim güvencesi (denetim Y2 + O8):
 *  - "Bugün" TR takvimiyle, sunucunun saat diliminden bağımsız hesaplanır (`lib/cron-time`).
 *  - Takip ALICI başına tutulur: bir alıcı başarılı diye şablon "gönderildi" sayılmaz; yalnız
 *    bütün alıcılara ulaşılınca şablon kapanır. Başarılı alıcıya ikinci kez gitmez.
 *  - Geçici SMTP hatası aynı koşuda geri çekilmeyle yeniden denenir. Yine de ulaşılamayan alıcı
 *    varsa yanıt `ok:false` + 500 olur → orkestratör non-2xx döner ve alarm üretir; elle
 *    `/api/cron/daily?only=intern-deadline` ile yalnız kalanlar yeniden denenir.
 *  - Bayrak her başarılı gönderimden SONRA yazılır; fonksiyon yarıda öldürülse bile gönderilenler
 *    işaretli kalır.
 */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const deadlineAt = readCronDeadline(req, FALLBACK_BUDGET_MS);

  try {
    const now = new Date();
    const { day, month, year } = trDateParts(now);
    const dayKey = trDayKey(now);

    const templates = await getInternTaskEmails();
    // Hatırlatması kapatılmış (reminder:false) şablonlar atlanır; arşivliler zaten listede yok.
    const dueToday = templates.filter((t) => t.reminder !== false && deadlineIsToday(t.deadline, { day, month, year }));
    if (dueToday.length === 0) {
      return NextResponse.json({ ok: true, skipped: 'no-template-due-today', today: dayKey });
    }

    const flagRow = await prisma.settings.findUnique({ where: { key: SENT_FLAG_KEY }, select: { value: true } });
    const flag = readFlag(flagRow?.value, dayKey);
    const doneTemplates = new Set(flag.templateIds);

    const pending = dueToday.filter((t) => !doneTemplates.has(t.id));
    if (pending.length === 0) {
      return NextResponse.json({ ok: true, skipped: 'already-sent-today', dueToday: dueToday.length });
    }

    if (!isMailConfigured()) {
      // Gönderilmesi gereken hatırlatma var ama kanal yok: bu bir hata (sessizce "ok" sayılmaz).
      return NextResponse.json(
        { ok: false, error: 'Mail yapılandırması eksik; son gün hatırlatmaları gönderilemedi.', pending: pending.length },
        { status: 503 }
      );
    }

    let sent = 0;
    let deferred = 0;
    const failures: string[] = [];
    let flagWriteFailed = false;

    for (const t of pending) {
      const deadlineLabel = formatDeadlineLabel(t.deadline) || 'bugün';
      const recipients = Array.from(new Set(t.email.split(',').map((s) => s.trim()).filter(Boolean)));
      const already = new Set(flag.recipients[t.id] ?? []);
      const name = t.recipientName || '';

      for (const email of recipients) {
        if (already.has(email.toLowerCase())) continue;
        if (Date.now() + 5_000 > deadlineAt) {
          deferred++;
          continue;
        }
        const html = renderSimpleBrandedEmail({
          heading: '⏳ Son gün: Görevini bugün teslim et!',
          accent: '#f59e0b',
          footerNote: 'Teslimini ya da sorunu bu maili yanıtlayarak iletebilirsin.',
          bodyHtml: `
            <p style="margin:0 0 14px;line-height:1.7;color:#475569;font-size:15px;">Merhaba${name ? ' ' + escapeEmailHtml(name) : ''},</p>
            <p style="margin:0 0 14px;line-height:1.7;color:#475569;font-size:15px;">
              <b style="color:#b45309;">${escapeEmailHtml(t.department)}</b> görevinin son teslim tarihi <b style="color:#b45309;">bugün</b> — <b style="color:#b45309;">${escapeEmailHtml(deadlineLabel)}</b>.
              Hazırladığın çalışmayı bu saate kadar iletmeni bekliyoruz. 🚀
            </p>
            <p style="margin:0;line-height:1.7;color:#475569;font-size:15px;">
              Eğer çoktan tamamladıysan, teşekkürler! Bir sorun yaşarsan bize hemen yaz.
            </p>`,
        });
        const text = `Merhaba${name ? ' ' + name : ''},\n\n${t.department} görevinin son teslim tarihi bugün — ${deadlineLabel}. Çalışmanı bu saate kadar ilet.\n\nBaşarılar dileriz. ReverBot & QRateX Ekibi`;
        const r = await sendWithRetry(
          () => sendTransactionalEmail({ to: email, subject: '⏳ QRateX — Görev bugün teslim (son gün)', html, text }),
          { attempts: 2, deadlineAt }
        );
        if (!r.ok) {
          failures.push(`${t.id}:${email}: ${'error' in r ? String(r.error).slice(0, 120) : 'gönderilemedi'}`);
          continue;
        }
        sent++;
        already.add(email.toLowerCase());
        flag.recipients[t.id] = Array.from(already);
        // Her başarılı gönderimden sonra yaz: yarıda kesilirse bile aynı alıcıya ikinci mail gitmez.
        await writeFlag(flag).catch((e) => {
          flagWriteFailed = true;
          console.error('[CRON intern-deadline] bayrak yazılamadı (çift gönderim riski):', e);
        });
      }

      if (recipients.every((e) => already.has(e.toLowerCase()))) {
        doneTemplates.add(t.id);
        flag.templateIds = Array.from(doneTemplates);
        await writeFlag(flag).catch((e) => {
          flagWriteFailed = true;
          console.error('[CRON intern-deadline] bayrak yazılamadı:', e);
        });
      }
    }

    const ok = failures.length === 0 && deferred === 0 && !flagWriteFailed;
    const body = {
      ok,
      sent,
      templates: pending.length,
      dueToday: dueToday.length,
      ...(failures.length ? { failed: failures.length, failures: failures.slice(0, 20) } : {}),
      ...(deferred ? { deferred } : {}),
      ...(flagWriteFailed ? { flagWriteFailed: true } : {}),
      ...(!ok
        ? {
            error: [
              failures.length ? `${failures.length} alıcıya ulaşılamadı` : '',
              deferred ? `${deferred} alıcı süre bütçesi yüzünden ertelendi` : '',
              flagWriteFailed ? 'gönderim bayrağı yazılamadı' : '',
            ]
              .filter(Boolean)
              .join('; '),
          }
        : {}),
    };
    return NextResponse.json(body, { status: ok ? 200 : 500 });
  } catch (error) {
    console.error('[CRON intern-deadline]', error);
    return NextResponse.json({ ok: false, error: 'Hatırlatma gönderilemedi' }, { status: 500 });
  }
}
