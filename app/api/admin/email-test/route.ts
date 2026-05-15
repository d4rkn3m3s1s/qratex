import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { buildAdminTestEmail } from '@/lib/email';
import { isMailConfigured, sendTransactionalEmail } from '@/lib/mail-sender';
import { getPublicAppOriginFromRequest } from '@/lib/public-app-origin';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  to: z.string().trim().email().max(320).optional(),
});

/** Admin: SMTP veya Resend ile test e-postası */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  if (!isMailConfigured()) {
    return NextResponse.json(
      { success: false, error: 'E-posta yapılandırılmadı (SMTP veya RESEND_API_KEY).' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || 'Geçersiz' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const to = parsed.data.to || session.user.email;
  if (!to) {
    return NextResponse.json({ error: 'Alıcı e-posta yok' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const base = getPublicAppOriginFromRequest(request);
  const { html, text } = buildAdminTestEmail(base);
  const result = await sendTransactionalEmail({
    to,
    subject: 'QRATEX — E-posta testi',
    html,
    text,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 502, headers: PRIVATE_NO_STORE_HEADERS });
  }

  return NextResponse.json(
    {
      success: true,
      message: `${to} adresine test gönderildi.`,
      delivery: {
        channel: result.channel,
        effectiveFrom: result.effectiveFrom,
        usedResendAfterSmtpFailure: Boolean(result.usedResendAfterSmtpFailure),
      },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
