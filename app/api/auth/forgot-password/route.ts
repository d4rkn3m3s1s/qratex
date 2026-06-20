import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getClientIdentifier, checkAuthEmailActionLimit } from '@/lib/rate-limit';
import { createAuthEmailToken, AUTH_TOKEN_PURPOSE } from '@/lib/auth-email-token';
import { sendPasswordResetEmail } from '@/lib/email';
import { isMailConfigured } from '@/lib/mail-sender';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { safePostLoginRedirect } from '@/lib/safe-callback-url';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
  callbackUrl: z.string().max(2048).optional(),
});

export async function POST(request: NextRequest) {
  const ip = getClientIdentifier(request);
  const rl = await checkAuthEmailActionLimit('forgot_password', ip);
  if (!rl.ok) {
    return NextResponse.json(
      { success: true, message: 'İsteğiniz alındı.' },
      {
        status: 200,
        headers: {
          ...PRIVATE_NO_STORE_HEADERS,
          ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}),
        },
      }
    );
  }

  if (!isMailConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          'E-posta sunucusu yapılandırılmamış. Yönetici: Vercel’de SMTP (Gmail) veya RESEND_API_KEY + EMAIL_FROM ayarlayın.',
      },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || 'Geçersiz e-posta' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, emailVerified: true },
  });

  if (user?.emailVerified) {
    const plain = await createAuthEmailToken(user.id, AUTH_TOKEN_PURPOSE.PASSWORD_RESET, 60 * 60 * 1000);
    const base = getPublicAppOrigin();
    const safeCb = safePostLoginRedirect(parsed.data.callbackUrl, base);
    const qs = new URLSearchParams({ token: plain });
    if (safeCb) qs.set('callbackUrl', safeCb);
    const resetUrl = `${base}/auth/reset-password?${qs.toString()}`;
    const sent = await sendPasswordResetEmail(user.email, resetUrl, user.name || undefined);
    if (!sent.ok) {
      console.error('[forgot-password] send failed', sent.error);
      return NextResponse.json(
        { success: false, error: sent.error || 'E-posta gönderilemedi.' },
        { status: 502, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
  }

  return NextResponse.json(
    {
      success: true,
      message:
        'Bu e-posta ile kayıtlı ve doğrulanmış bir hesap varsa, şifre sıfırlama bağlantısı gönderildi. Gelen kutusu ve spam klasörünü kontrol edin.',
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
