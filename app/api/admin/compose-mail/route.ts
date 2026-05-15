import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { buildAdminComposeEmail } from '@/lib/email';
import { isMailConfigured, sendTransactionalEmail } from '@/lib/mail-sender';
import { getPublicAppOrigin } from '@/lib/public-app-origin';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  to: z.string().trim().email().max(320),
  subject: z.string().trim().min(1, 'Konu gerekli').max(200),
  message: z.string().trim().min(1, 'Mesaj gerekli').max(12_000),
});

/** Admin: logo şablonu ile tek seferlik bilgilendirme e-postası (SMTP / Resend). */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: 'E-posta yapılandırılmadı (SMTP veya RESEND_API_KEY).' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || 'Geçersiz istek' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const siteUrl = getPublicAppOrigin();
  const { html, text } = buildAdminComposeEmail({
    siteUrl,
    subjectHeading: parsed.data.subject,
    messagePlain: parsed.data.message,
  });

  const result = await sendTransactionalEmail({
    to: parsed.data.to,
    subject: parsed.data.subject,
    html,
    text,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 502, headers: PRIVATE_NO_STORE_HEADERS });
  }

  return NextResponse.json(
    {
      success: true,
      message: `${parsed.data.to} adresine gönderildi.`,
      delivery: {
        channel: result.channel,
        effectiveFrom: result.effectiveFrom,
        usedResendAfterSmtpFailure: Boolean(result.usedResendAfterSmtpFailure),
      },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
