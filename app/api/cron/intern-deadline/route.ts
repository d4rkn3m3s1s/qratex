import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail, isMailConfigured } from '@/lib/mail-sender';
import { getInternTaskEmails, INTERN_TASK_DEADLINE_LABEL } from '@/lib/intern-task-emails';
import { buildTransactionalEmailHtml, buildTransactionalPlainText, getTransactionalEmailLogoUrl } from '@/lib/transactional-email';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** Son teslim hatırlatmasının gönderileceği gün (yerel/UTC gün eşleşmesi — TR ~UTC+3). */
const REMINDER_DATE = { month: 8, day: 14 }; // 14 Ağustos
const SENT_FLAG_KEY = 'intern_deadline_reminder_sent';

function validBearer(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const got = authHeader ?? '';
  if (got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

/**
 * Vercel Cron — her gün çalışır. 14 Ağustos ise (ve daha önce gönderilmediyse) tüm stajyer
 * görev alıcılarına "görev bugün bitiyor, sonucunu gönder" hatırlatma maili atar. Idempotent:
 * Settings flag ile aynı yıl bir kez gönderilir. Diğer günlerde no-op.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET ayarlı değil; cron devre dışı.' }, { status: 503 });
  if (!validBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // TR saatiyle bugünün ay/gün'ü.
    const nowTr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const month = nowTr.getMonth() + 1;
    const day = nowTr.getDate();
    const year = nowTr.getFullYear();

    if (month !== REMINDER_DATE.month || day !== REMINDER_DATE.day) {
      return NextResponse.json({ ok: true, skipped: 'not-deadline-day', today: `${day}.${month}` });
    }

    // Idempotent: bu yıl zaten gönderildiyse tekrar gönderme.
    const flag = await prisma.settings.findUnique({ where: { key: SENT_FLAG_KEY }, select: { value: true } }).catch(() => null);
    const sentYear = (flag?.value as { year?: number } | null)?.year;
    if (sentYear === year) {
      return NextResponse.json({ ok: true, skipped: 'already-sent-this-year' });
    }

    if (!isMailConfigured()) {
      return NextResponse.json({ error: 'Mail yapılandırması eksik' }, { status: 400 });
    }

    const templates = await getInternTaskEmails();
    // Benzersiz alıcı adresleri (virgüllü çok alıcıları da aç).
    const recipients = new Map<string, string>(); // email → recipientName
    for (const t of templates) {
      for (const e of t.email.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!recipients.has(e)) recipients.set(e, t.recipientName || '');
      }
    }

    const origin = getPublicAppOrigin();
    const logoUrl = getTransactionalEmailLogoUrl(origin);

    let sent = 0;
    for (const [email, name] of recipients) {
      const html = buildTransactionalEmailHtml({
        heading: `⏳ Son gün: Görevini bugün teslim et!`,
        bodyHtml: `
          <p style="margin:0 0 16px;line-height:1.7;color:#334155;font-size:15px;">Merhaba${name ? ' ' + escapeName(name) : ''},</p>
          <p style="margin:0 0 16px;line-height:1.7;color:#334155;font-size:15px;">
            QRateX ekip görevinin son teslim tarihi <b>bugün</b> — <b>${INTERN_TASK_DEADLINE_LABEL}</b>.
            Hazırladığın çalışmayı bu saate kadar iletmeni bekliyoruz. 🚀
          </p>
          <p style="margin:0;line-height:1.7;color:#334155;font-size:15px;">
            Eğer çoktan tamamladıysan, teşekkürler! Bir sorun yaşarsan bize hemen yaz.
          </p>`,
        footnoteHtml: 'Başarılar dileriz. <b>ReverBot &amp; QRateX Ekibi</b>',
        logoUrl,
        brandLinkHref: origin,
      });
      const text = buildTransactionalPlainText({
        heading: 'Son gün: Görevini bugün teslim et!',
        bodyLines: [
          `Merhaba${name ? ' ' + name : ''},`,
          '',
          `QRateX ekip görevinin son teslim tarihi bugün — ${INTERN_TASK_DEADLINE_LABEL}. Çalışmanı bu saate kadar ilet.`,
          '',
          'Başarılar dileriz. ReverBot & QRateX Ekibi',
        ],
      });
      const r = await sendTransactionalEmail({ to: email, subject: '⏳ QRateX — Görev bugün teslim (son gün)', html, text });
      if (r.ok) sent++;
    }

    // Gönderim bayrağını yaz (bu yıl tekrar göndermesin).
    await prisma.settings.upsert({
      where: { key: SENT_FLAG_KEY },
      update: { value: { year } as Prisma.InputJsonValue, category: 'email' },
      create: { key: SENT_FLAG_KEY, value: { year } as Prisma.InputJsonValue, category: 'email' },
    }).catch(() => {});

    return NextResponse.json({ ok: true, sent, total: recipients.size });
  } catch (error) {
    console.error('[CRON intern-deadline]', error);
    return NextResponse.json({ error: 'Hatırlatma gönderilemedi' }, { status: 500 });
  }
}

/** Basit HTML-escape (isim enjeksiyonu önlemi). */
function escapeName(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
