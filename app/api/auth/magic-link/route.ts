import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getClientIdentifier, checkAuthEmailActionLimit, checkRateLimitDb } from '@/lib/rate-limit';
import { createAuthEmailToken, AUTH_TOKEN_PURPOSE } from '@/lib/auth-email-token';
import { sendMagicLinkEmail } from '@/lib/email';
import { isMailConfigured } from '@/lib/mail-sender';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { getBooleanSiteSetting } from '@/lib/site-setting-bool';
import { safePostLoginRedirect } from '@/lib/safe-callback-url';
import { emailLookupFilter, normalizeEmail } from '@/lib/auth/normalize-email';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().trim().max(320),
  callbackUrl: z.string().max(2048).optional(),
});

const UNIFORM_MESSAGE = 'E-posta adresin sistemde kayıtlı ve doğrulanmışsa giriş bağlantısı gönderildi.';

function uniformOk(extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    { success: true, message: UNIFORM_MESSAGE },
    { status: 200, headers: { ...PRIVATE_NO_STORE_HEADERS, ...(extraHeaders ?? {}) } }
  );
}

/**
 * Magic link ister. Güvenlik: ortak `callbackUrl` süzgeci (P0-02), hesap varlığından
 * bağımsız yanıt + gönderim `after` ile (hesap sayımı yok), e-posta başına saatlik sınır
 * (kurbanın bağlantısı sürekli geçersiz kılınamaz / gelen kutusu doldurulamaz).
 * 2FA'lı hesapta bağlantı tek başına yetmez: `/auth/magic` ikinci adımı ister (P0-08).
 */
export async function POST(request: NextRequest) {
  const ip = getClientIdentifier(request);
  const rl = await checkAuthEmailActionLimit('magic_link', ip);
  if (!rl.ok) {
    return uniformOk(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined);
  }

  const magicEnabled = await getBooleanSiteSetting('enableMagicLink', false);
  if (!magicEnabled) {
    return NextResponse.json(
      { success: false, code: 'MAGIC_LINK_DISABLED', error: 'Bağlantıyla giriş şu anda kapalı.' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  if (!isMailConfigured()) {
    return NextResponse.json(
      { success: false, code: 'MAIL_NOT_CONFIGURED', error: 'E-posta gönderimi şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const email = parsed.success ? normalizeEmail(parsed.data.email) : '';
  if (!parsed.success || !z.string().email().safeParse(email).success) {
    return NextResponse.json(
      { success: false, code: 'INVALID_EMAIL', error: 'Geçerli bir e-posta adresi gir.' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const perEmail = await checkRateLimitDb(`magic_link_email:${email}`, 3, 60 * 60_000);
  if (!perEmail.ok) return uniformOk();

  const callbackUrl = parsed.data.callbackUrl;
  after(async () => {
    try {
      const user = await prisma.user.findFirst({
        where: { email: emailLookupFilter(email) },
        select: { id: true, name: true, email: true, emailVerified: true, suspendedAt: true, anonymizedAt: true },
      });
      if (!user?.emailVerified || user.suspendedAt || user.anonymizedAt) return;

      const plain = await createAuthEmailToken(user.id, AUTH_TOKEN_PURPOSE.MAGIC_LOGIN, 15 * 60 * 1000);
      const base = getPublicAppOrigin();
      const safeCb = safePostLoginRedirect(callbackUrl, base);
      const qs = new URLSearchParams({ token: plain });
      if (safeCb) qs.set('callbackUrl', safeCb);
      const sent = await sendMagicLinkEmail(user.email, `${base}/auth/magic?${qs.toString()}`, user.name || undefined);
      if (!sent.ok) console.error('[magic-link] send failed');
    } catch (error) {
      const { captureApiError } = await import('@/lib/capture-api-error');
      captureApiError(error, { route: 'POST /api/auth/magic-link', status: 500 });
    }
  });

  return uniformOk();
}
