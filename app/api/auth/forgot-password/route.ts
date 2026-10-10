import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getClientIdentifier, checkAuthEmailActionLimit, checkRateLimitDb } from '@/lib/rate-limit';
import {
  createAuthEmailToken,
  AUTH_TOKEN_PURPOSE,
  buildEmailVerifyUrl,
  issueEmailVerificationToken,
  revokeEmailVerificationTokens,
} from '@/lib/auth-email-token';
import { sendPasswordResetEmail, sendVerificationEmail } from '@/lib/email';
import { isMailConfigured } from '@/lib/mail-sender';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { safePostLoginRedirect } from '@/lib/safe-callback-url';
import { emailLookupFilter, normalizeEmail } from '@/lib/auth/normalize-email';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().trim().max(320),
  callbackUrl: z.string().max(2048).optional(),
});

const UNIFORM_MESSAGE =
  'Bu e-posta ile kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.';

function uniformOk(extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    // `code` istemcinin TR/EN metni seçmesi içindir; `message` eski istemciler için korunur.
    { success: true, code: 'SENT', message: UNIFORM_MESSAGE },
    { status: 200, headers: { ...PRIVATE_NO_STORE_HEADERS, ...(extraHeaders ?? {}) } }
  );
}

/**
 * Şifre sıfırlama bağlantısı ister.
 *
 * Güvenlik (P0-02 + denetim bulguları):
 *  - `callbackUrl` ortak süzgeçten geçer (ters bölü / `javascript:` / başka köken reddi) →
 *    resmi Qratex e-postası oltalama yönlendirmesine dönüşemez.
 *  - Yanıt hesabın varlığından bağımsızdır; token üretimi ve gönderim yanıttan SONRA
 *    yapılır (`after`) → zamanlama ve 502 farkıyla hesap sayımı yapılamaz.
 *  - E-posta normalize edilir (karışık harfli kayıtlar da sıfırlayabilir) ve e-posta başına
 *    saatlik sınır vardır (kurbanın gelen kutusu doldurulamaz).
 *  - E-postası DOĞRULANMAMIŞ hesap çıkmaza düşmez: sıfırlama yerine yeni doğrulama bağlantısı
 *    gönderilir (eskiden "gönderildi" deniyor ama hiçbir şey gelmiyordu). Yanıt yine aynıdır.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIdentifier(request);
  const rl = await checkAuthEmailActionLimit('forgot_password', ip);
  if (!rl.ok) {
    return uniformOk(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined);
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

  const perEmail = await checkRateLimitDb(`forgot_password_email:${email}`, 3, 60 * 60_000);
  if (!perEmail.ok) return uniformOk();

  const callbackUrl = parsed.data.callbackUrl;
  after(async () => {
    try {
      const user = await prisma.user.findFirst({
        where: { email: emailLookupFilter(email) },
        select: { id: true, name: true, email: true, emailVerified: true, suspendedAt: true, anonymizedAt: true },
      });
      if (!user || user.suspendedAt || user.anonymizedAt) return;

      if (!user.emailVerified) {
        await revokeEmailVerificationTokens(user.id, user.email);
        const verifyPlain = await issueEmailVerificationToken(user.id);
        const sentVerify = await sendVerificationEmail(
          user.email,
          buildEmailVerifyUrl(getPublicAppOrigin(), verifyPlain),
          user.name || undefined
        );
        if (!sentVerify.ok) console.error('[forgot-password] verification resend failed');
        return;
      }

      const plain = await createAuthEmailToken(user.id, AUTH_TOKEN_PURPOSE.PASSWORD_RESET, 60 * 60 * 1000);
      const base = getPublicAppOrigin();
      const safeCb = safePostLoginRedirect(callbackUrl, base);
      const qs = new URLSearchParams({ token: plain });
      if (safeCb) qs.set('callbackUrl', safeCb);
      const sent = await sendPasswordResetEmail(user.email, `${base}/auth/reset-password?${qs.toString()}`, user.name || undefined);
      if (!sent.ok) console.error('[forgot-password] send failed');
    } catch (error) {
      const { captureApiError } = await import('@/lib/capture-api-error');
      captureApiError(error, { route: 'POST /api/auth/forgot-password', status: 500 });
    }
  });

  return uniformOk();
}
