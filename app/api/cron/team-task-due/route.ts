import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cron-auth';
import { readCronDeadline, sendWithRetry } from '@/lib/cron-delivery';
import { dueRelativeLabel, taskDueWindow } from '@/lib/cron-time';
import { sendTransactionalEmail, isMailConfigured } from '@/lib/mail-sender';
import { renderSimpleBrandedEmail } from '@/lib/intern-task-emails';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { escapeEmailHtml } from '@/lib/security/escape-html';
import { NOT_INITIATIVE } from '@/lib/team/access';
import { teamTaskHref } from '@/lib/team/href';
import { effectiveDue } from '@/lib/team/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_TASKS_PER_RUN = 200;
const FALLBACK_BUDGET_MS = 45_000;

/**
 * Günlük (`/api/cron/daily` içinden). Önümüzdeki 24 saat içinde biten (ya da hatırlatması
 * gönderilemeden yakın zamanda biten), tamamlanmamış ve atanmış ekip görevleri için atanan
 * kişiye hatırlatma maili atar.
 *
 * Eski davranış ve düzeltme:
 *  - "TR günü" `toLocaleString` + `setHours` ile hesaplanıyordu; Vercel UTC'de 3 saat kayıyordu
 *    (O8). Artık pencere mutlak zamandır, mail metni TR takvimine göre "bugün/yarın/geçti" der.
 *  - Başarısız gönderim işaretlenmiyor, ertesi gün görev pencereden çıktığı için hatırlatma
 *    kayboluyordu (Y2). Artık geçici hata aynı koşuda yeniden denenir; yine olmazsa görev
 *    işaretsiz kalır, geri bakış penceresi sayesinde ertesi koşuda tekrar denenir ve yanıt
 *    `ok:false` + 500 olur (alarm).
 *  - İşaretleme görev başına, gönderimden hemen sonra ve `dueReminderSentAt: null` koşuluyla
 *    yapılır: yarıda kesilen koşu çift mail üretmez.
 */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const deadlineAt = readCronDeadline(req, FALLBACK_BUDGET_MS);

  try {
    const now = new Date();
    const { from, to } = taskDueWindow(now);

    const tasks = await prisma.companyTask.findMany({
      where: {
        AND: [
          NOT_INITIATIVE,
          {
            dueAt: { gte: from, lte: to },
            status: { not: 'done' },
            archivedAt: null,
            assignedToId: { not: null },
            dueReminderSentAt: null,
          },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        dueAt: true,
        assignedTo: { select: { email: true, name: true, role: true } },
      },
      orderBy: { dueAt: 'asc' },
      take: MAX_TASKS_PER_RUN,
    });

    if (tasks.length === 0) return NextResponse.json({ ok: true, sent: 0, candidates: 0 });

    if (!isMailConfigured()) {
      return NextResponse.json(
        { ok: false, error: 'Mail yapılandırması eksik; görev hatırlatmaları gönderilemedi.', candidates: tasks.length },
        { status: 503 }
      );
    }

    const origin = getPublicAppOrigin().replace(/\/$/, '');

    let sent = 0;
    let deferred = 0;
    let noEmail = 0;
    let markFailed = 0;
    const failures: string[] = [];

    for (const t of tasks) {
      const email = t.assignedTo?.email;
      if (!email || !t.dueAt) {
        noEmail++;
        continue;
      }
      if (Date.now() + 5_000 > deadlineAt) {
        deferred++;
        continue;
      }
      const name = t.assignedTo?.name ?? '';
      // Alıcının paneline göre görev bağlantısı (ADMIN → /admin/ekip; diğerleri /customer/ekip).
      const teamUrl = `${origin}${teamTaskHref(t.assignedTo?.role ?? null, t.id)}`;
      // Gün-yalnız eski kayıtlar (UTC gece yarısı) İstanbul gün sonu kabul edilir.
      const due = effectiveDue(t.dueAt) ?? new Date(t.dueAt);
      const rel = dueRelativeLabel(due, now);
      const dueLabel = due.toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      const whenWord = rel === 'overdue' ? 'geçti' : rel === 'tomorrow' ? 'yarın' : 'bugün';
      const subject =
        rel === 'overdue'
          ? `⏰ Görevinin bitiş tarihi geçti: ${t.title}`
          : rel === 'tomorrow'
            ? `⏰ Görevin yarın bitiyor: ${t.title}`
            : `⏰ Görevin bugün bitiyor: ${t.title}`;
      const ask =
        rel === 'overdue'
          ? 'Henüz tamamlamadıysan en kısa sürede bitirmeni ya da durumu ekibe bildirmeni bekliyoruz.'
          : 'Henüz tamamlamadıysan zamanında bitirmeni bekliyoruz. 💪';

      const html = renderSimpleBrandedEmail({
        heading: `⏰ Görev hatırlatması: "${escapeEmailHtml(t.title)}"`,
        accent: '#0ea5e9',
        cta: { href: teamUrl, label: 'Görevi Aç' },
        bodyHtml: `
          <p style="margin:0 0 14px;line-height:1.7;color:#475569;font-size:15px;">Merhaba${name ? ' ' + escapeEmailHtml(name) : ''},</p>
          <p style="margin:0 0 14px;line-height:1.7;color:#475569;font-size:15px;">
            Sana atanan <b style="color:#0f172a;">"${escapeEmailHtml(t.title)}"</b> görevinin bitiş tarihi <b style="color:#0369a1;">${whenWord}</b> (${escapeEmailHtml(dueLabel)}).
            ${ask}
          </p>
          ${t.description ? `<div style="margin:0 0 4px;padding:12px 14px;background:#f1f5f9;border-radius:10px;font-size:14px;line-height:1.6;color:#475569;"><b>Görev notu:</b> ${escapeEmailHtml(t.description.slice(0, 300))}</div>` : ''}`,
      });
      const text = `Merhaba${name ? ' ' + name : ''},\n\nSana atanan "${t.title}" görevinin bitiş tarihi ${whenWord} (${dueLabel}). ${ask}\n\nGörevi aç: ${teamUrl}`;

      const r = await sendWithRetry(() => sendTransactionalEmail({ to: email, subject, html, text }), {
        attempts: 2,
        deadlineAt,
      });
      if (!r.ok) {
        failures.push(`${t.id}: ${'error' in r ? String(r.error).slice(0, 120) : 'gönderilemedi'}`);
        continue;
      }
      sent++;
      // Gönderimden hemen sonra işaretle: koşu yarıda kesilse bile bu göreve ikinci mail gitmez.
      try {
        await prisma.companyTask.updateMany({
          where: { id: t.id, dueReminderSentAt: null },
          data: { dueReminderSentAt: new Date() },
        });
      } catch (e) {
        markFailed++;
        console.error('[CRON team-task-due] işaretleme başarısız (çift gönderim riski):', e);
      }
    }

    const ok = failures.length === 0 && deferred === 0 && markFailed === 0;
    const body = {
      ok,
      sent,
      candidates: tasks.length,
      truncated: tasks.length === MAX_TASKS_PER_RUN,
      ...(noEmail ? { noEmail } : {}),
      ...(failures.length ? { failed: failures.length, failures: failures.slice(0, 20) } : {}),
      ...(deferred ? { deferred } : {}),
      ...(markFailed ? { markFailed } : {}),
      ...(!ok
        ? {
            error: [
              failures.length ? `${failures.length} hatırlatma gönderilemedi` : '',
              deferred ? `${deferred} hatırlatma süre bütçesi yüzünden ertelendi` : '',
              markFailed ? `${markFailed} görev işaretlenemedi` : '',
            ]
              .filter(Boolean)
              .join('; '),
          }
        : {}),
    };
    return NextResponse.json(body, { status: ok ? 200 : 500 });
  } catch (error) {
    console.error('[CRON team-task-due]', error);
    return NextResponse.json({ ok: false, error: 'Hatırlatma gönderilemedi' }, { status: 500 });
  }
}
