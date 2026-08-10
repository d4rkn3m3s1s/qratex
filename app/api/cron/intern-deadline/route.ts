import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail, isMailConfigured } from '@/lib/mail-sender';
import {
  getInternTaskEmails,
  INTERN_TASK_DEADLINE_LABEL,
  renderSimpleBrandedEmail,
  deadlineIsToday,
} from '@/lib/intern-task-emails';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** Idempotent bayrak anahtarı (bu şablon, bu gün için hatırlatma gönderildi mi). */
const SENT_FLAG_KEY = 'intern_deadline_reminder_sent';

function validBearer(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const got = authHeader ?? '';
  if (got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

/**
 * Vercel Cron — her gün çalışır. Son teslim tarihi (şablonun kendi `deadline`'ı; yoksa
 * varsayılan) BUGÜN olan görev şablonlarının alıcılarına "görev bugün bitiyor, sonucunu
 * gönder" hatırlatma maili atar. Her şablon kendi tarihinde tetiklenir (şablon-başına tarih).
 * Idempotent: Settings flag ile (şablon+gün) bazında bir kez gönderilir. CRON_SECRET fail-closed.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET ayarlı değil; cron devre dışı.' }, { status: 503 });
  if (!validBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // TR saatiyle bugünün gün/ay'ı + gün anahtarı (idempotent flag için).
    const nowTr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const day = nowTr.getDate();
    const month = nowTr.getMonth() + 1;
    const year = nowTr.getFullYear();
    const dayKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const templates = await getInternTaskEmails();
    // Bugüne denk gelen (kendi deadline'ı bugün olan) şablonları seç.
    const dueToday = templates.filter((t) => deadlineIsToday(t.deadline, { day, month }));
    if (dueToday.length === 0) {
      return NextResponse.json({ ok: true, skipped: 'no-template-due-today', today: `${day}.${month}` });
    }

    // Idempotent: bu gün için zaten gönderilen şablon id'leri.
    const flag = await prisma.settings.findUnique({ where: { key: SENT_FLAG_KEY }, select: { value: true } }).catch(() => null);
    const flagVal = (flag?.value as { dayKey?: string; templateIds?: string[] } | null) ?? null;
    const alreadySent = new Set(flagVal?.dayKey === dayKey ? (flagVal.templateIds ?? []) : []);

    const pending = dueToday.filter((t) => !alreadySent.has(t.id));
    if (pending.length === 0) {
      return NextResponse.json({ ok: true, skipped: 'already-sent-today', dueToday: dueToday.length });
    }

    if (!isMailConfigured()) {
      return NextResponse.json({ error: 'Mail yapılandırması eksik' }, { status: 400 });
    }

    let sent = 0;
    const doneTemplateIds: string[] = [...alreadySent];
    for (const t of pending) {
      const deadlineLabel = t.deadline && t.deadline.trim() ? t.deadline.trim() : INTERN_TASK_DEADLINE_LABEL;
      const recipients = t.email.split(',').map((s) => s.trim()).filter(Boolean);
      let anySuccess = false; // en az bir alıcıya ulaşıldıysa şablon "gönderildi" sayılır
      for (const email of recipients) {
        const name = t.recipientName || '';
        const html = renderSimpleBrandedEmail({
          heading: '⏳ Son gün: Görevini bugün teslim et!',
          accent: '#f59e0b',
          bodyHtml: `
            <p style="margin:0 0 14px;line-height:1.7;color:#475569;font-size:15px;">Merhaba${name ? ' ' + escapeName(name) : ''},</p>
            <p style="margin:0 0 14px;line-height:1.7;color:#475569;font-size:15px;">
              <b style="color:#b45309;">${escapeName(t.department)}</b> görevinin son teslim tarihi <b style="color:#b45309;">bugün</b> — <b style="color:#b45309;">${escapeName(deadlineLabel)}</b>.
              Hazırladığın çalışmayı bu saate kadar iletmeni bekliyoruz. 🚀
            </p>
            <p style="margin:0;line-height:1.7;color:#475569;font-size:15px;">
              Eğer çoktan tamamladıysan, teşekkürler! Bir sorun yaşarsan bize hemen yaz.
            </p>`,
        });
        const text = `Merhaba${name ? ' ' + name : ''},\n\n${t.department} görevinin son teslim tarihi bugün — ${deadlineLabel}. Çalışmanı bu saate kadar ilet.\n\nBaşarılar dileriz. ReverBot & QRateX Ekibi`;
        const r = await sendTransactionalEmail({ to: email, subject: '⏳ QRateX — Görev bugün teslim (son gün)', html, text });
        if (r.ok) { sent++; anySuccess = true; }
      }
      // FAIL-CLOSED: yalnız en az bir gönderim BAŞARILIYSA "bugün gönderildi" işaretle.
      // Hepsi başarısızsa (SMTP down vb.) işaretleme → aynı gün sonraki cron tekrar dener.
      if (anySuccess) doneTemplateIds.push(t.id);
    }

    // Gönderim bayrağını yaz (bu gün + gönderilen şablon id'leri).
    const uniqueIds = Array.from(new Set(doneTemplateIds));
    await prisma.settings.upsert({
      where: { key: SENT_FLAG_KEY },
      update: { value: { dayKey, templateIds: uniqueIds } as Prisma.InputJsonValue, category: 'email' },
      create: { key: SENT_FLAG_KEY, value: { dayKey, templateIds: uniqueIds } as Prisma.InputJsonValue, category: 'email' },
    }).catch((e) => { console.error('[CRON intern-deadline] flag yazımı başarısız (çift-gönderim riski):', e); });

    return NextResponse.json({ ok: true, sent, templates: pending.length, dueToday: dueToday.length });
  } catch (error) {
    console.error('[CRON intern-deadline]', error);
    return NextResponse.json({ error: 'Hatırlatma gönderilemedi' }, { status: 500 });
  }
}

/** Basit HTML-escape (isim/etiket enjeksiyonu önlemi). */
function escapeName(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
