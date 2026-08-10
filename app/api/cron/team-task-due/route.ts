import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail, isMailConfigured } from '@/lib/mail-sender';
import { renderSimpleBrandedEmail } from '@/lib/intern-task-emails';
import { getPublicAppOrigin } from '@/lib/public-app-origin';

export const dynamic = 'force-dynamic';

const MAX_TASKS_PER_RUN = 200;

function validBearer(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const got = authHeader ?? '';
  if (got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Vercel Cron — her gün çalışır. Bitiş tarihi (dueAt) BUGÜN olan, tamamlanmamış (status≠done)
 * ve atanmış ekip görevleri için, atanan kişiye "görevin bugün bitiyor" hatırlatma maili atar.
 * Idempotent: dueReminderSentAt ile aynı görev için bir kez gönderilir. CRON_SECRET fail-closed.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET ayarlı değil; cron devre dışı.' }, { status: 503 });
  if (!validBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!isMailConfigured()) {
      return NextResponse.json({ ok: true, skipped: 'mail-not-configured' });
    }

    // TR günün başı/sonu (bugün bitişi olan görevler).
    const nowTr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const dayStart = new Date(nowTr); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(nowTr); dayEnd.setHours(23, 59, 59, 999);

    // Bitişi bugün + tamamlanmamış + atanmış + hatırlatma gönderilmemiş.
    const tasks = await prisma.companyTask.findMany({
      where: {
        dueAt: { gte: dayStart, lte: dayEnd },
        status: { not: 'done' },
        assignedToId: { not: null },
        dueReminderSentAt: null,
      },
      select: {
        id: true, title: true, description: true, dueAt: true,
        assignedTo: { select: { email: true, name: true } },
      },
      take: MAX_TASKS_PER_RUN,
    });

    const origin = getPublicAppOrigin();
    const teamUrl = `${origin.replace(/\/$/, '')}/customer/ekip`;

    let sent = 0;
    const sentIds: string[] = [];
    for (const t of tasks) {
      const email = t.assignedTo?.email;
      if (!email) continue;
      const name = t.assignedTo?.name ?? '';
      const dueLabel = t.dueAt
        ? new Date(t.dueAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
        : 'bugün';

      const html = renderSimpleBrandedEmail({
        heading: `⏰ Görevinin son günü: "${esc(t.title)}"`,
        accent: '#0ea5e9',
        cta: { href: teamUrl, label: 'Görevi Aç' },
        bodyHtml: `
          <p style="margin:0 0 14px;line-height:1.7;color:#475569;font-size:15px;">Merhaba${name ? ' ' + esc(name) : ''},</p>
          <p style="margin:0 0 14px;line-height:1.7;color:#475569;font-size:15px;">
            Sana atanan <b style="color:#0f172a;">"${esc(t.title)}"</b> görevinin bitiş tarihi <b style="color:#0369a1;">bugün</b> (${esc(dueLabel)}).
            Henüz tamamlamadıysan bugün içinde bitirmeni bekliyoruz. 💪
          </p>
          ${t.description ? `<div style="margin:0 0 4px;padding:12px 14px;background:#f1f5f9;border-radius:10px;font-size:14px;line-height:1.6;color:#475569;"><b>Görev notu:</b> ${esc(t.description.slice(0, 300))}</div>` : ''}`,
      });
      const text = `Merhaba${name ? ' ' + name : ''},\n\nSana atanan "${t.title}" görevinin bitiş tarihi bugün (${dueLabel}). Bugün içinde bitirmeni bekliyoruz.\n\nGörevi aç: ${teamUrl}`;

      const r = await sendTransactionalEmail({ to: email, subject: `⏰ Görevin bugün bitiyor: ${t.title}`, html, text });
      if (r.ok) { sent++; sentIds.push(t.id); }
    }

    // Gönderilenleri işaretle (çift göndermesin). İşaretleme BAŞARISIZ olursa fail-open:
    // dueReminderSentAt null kalır → aynı gün tekrar tetiklenirse çift mail. Hatayı LOGLA (görünür).
    let markFailed = false;
    if (sentIds.length) {
      await prisma.companyTask.updateMany({
        where: { id: { in: sentIds } },
        data: { dueReminderSentAt: new Date() },
      }).catch((e) => { markFailed = true; console.error('[CRON team-task-due] işaretleme başarısız (çift-gönderim riski):', e); });
    }

    return NextResponse.json({ ok: true, sent, candidates: tasks.length, ...(markFailed ? { markFailed: true } : {}) });
  } catch (error) {
    console.error('[CRON team-task-due]', error);
    return NextResponse.json({ error: 'Hatırlatma gönderilemedi' }, { status: 500 });
  }
}
