import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getClientIdentifier, checkAuthEmailActionLimit } from '@/lib/rate-limit';
import { createAuthEmailToken, AUTH_TOKEN_PURPOSE } from '@/lib/auth-email-token';
import { sendMagicLinkEmail } from '@/lib/email';
import { isMailConfigured } from '@/lib/mail-sender';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { getBooleanSiteSetting } from '@/lib/site-setting-bool';
import { safePostLoginRedirect } from '@/lib/safe-callback-url';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
  callbackUrl: z.string().max(2048).optional(),
});

export async function POST(request: NextRequest) {
  const ip = getClientIdentifier(request);
  const rl = checkAuthEmailActionLimit('magic_link', ip);
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

  const magicEnabled = await getBooleanSiteSetting('enableMagicLink', false);
  if (!magicEnabled) {
    return NextResponse.json({ error: 'Magic link devre dışı.' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (!isMailConfigured()) {
    return NextResponse.json(
      {
        error:
          'E-posta yapılandırılmadı. SMTP (Gmail uygulama şifresi) veya Resend anahtarı ekleyin.',
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
    const plain = await createAuthEmailToken(user.id, AUTH_TOKEN_PURPOSE.MAGIC_LOGIN, 15 * 60 * 1000);
    const base = getPublicAppOrigin();
    const safeCb = safePostLoginRedirect(parsed.data.callbackUrl, base);
    const qs = new URLSearchParams({ token: plain });
    if (safeCb) qs.set('callbackUrl', safeCb);
    const magicUrl = `${base}/auth/magic?${qs.toString()}`;
    const sent = await sendMagicLinkEmail(user.email, magicUrl, user.name || undefined);
    if (!sent.ok) {
      console.error('[magic-link] send failed', sent.error);
      return NextResponse.json(
        { error: sent.error || 'E-posta gönderilemedi.' },
        { status: 502, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
  }

  return NextResponse.json(
    {
      success: true,
      message:
        'E-posta adresiniz sistemde ve doğrulanmışsa, giriş bağlantısı gönderildi.',
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
