import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkRateLimitDb, getClientIdentifier } from '@/lib/rate-limit';
import {
  buildEmailVerifyUrl,
  findEmailVerifyTokenOwner,
  issueEmailVerificationToken,
  revokeEmailVerificationTokens,
} from '@/lib/auth-email-token';
import { emailLookupFilter, normalizeEmail } from '@/lib/auth/normalize-email';
import { sendVerificationEmail } from '@/lib/email';
import { isMailConfigured } from '@/lib/mail-sender';
import { getPublicAppOrigin } from '@/lib/public-app-origin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/verify-email/resend — doğrulama bağlantısını yeniden gönderir (P0-39).
 *
 * Eskiden bu uç yoktu: bağlantısı kaybolan / 24 saati kaçıran kullanıcı için giriş,
 * şifre sıfırlama, magic link ve yeniden kayıt kapılarının dördü de kapalıydı.
 *
 * Gövde: `{ email }` veya (süresi dolmuş bağlantı ekranından) `{ token }`.
 * Kullanıcı sayımına karşı: yanıt hesabın varlığından/durumundan BAĞIMSIZ hep aynıdır ve
 * token üretimi + e-posta gönderimi yanıttan SONRA (`after`) yapılır (zamanlama farkı yok).
 * Oran sınırı: IP başına 6 / 15 dk, e-posta başına 3 / saat (varlıktan bağımsız uygulanır).
 */
const bodySchema = z
  .object({
    email: z.string().trim().max(320).optional(),
    token: z.string().trim().min(16).max(512).optional(),
  })
  .refine((v) => !!v.email || !!v.token, { message: 'email_or_token_required' });

const COOLDOWN_SEC = 60;

function uniformOk() {
  return NextResponse.json({ success: true, cooldownSec: COOLDOWN_SEC }, { headers: PRIVATE_NO_STORE_HEADERS });
}

function limited(retryAfterMs?: number) {
  const sec = Math.max(1, Math.ceil((retryAfterMs ?? 60_000) / 1000));
  return NextResponse.json(
    { success: false, code: 'RATE_LIMITED', retryAfterSec: sec },
    { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(sec) } }
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIdentifier(request);
  const ipLimit = await checkRateLimitDb(`verify_resend_ip:${ip}`, 6, 15 * 60_000);
  if (!ipLimit.ok) return limited(ipLimit.retryAfterMs);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, code: 'INVALID_INPUT' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  if (!isMailConfigured()) {
    // Hesaptan bağımsız bir platform durumu; altyapı ayrıntısı kullanıcıya gösterilmez.
    return NextResponse.json(
      { success: false, code: 'MAIL_NOT_CONFIGURED' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const email = parsed.data.email ? normalizeEmail(parsed.data.email) : '';
  if (parsed.data.email && (!email || !email.includes('@'))) {
    return NextResponse.json(
      { success: false, code: 'INVALID_EMAIL' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  const limitKey = email || `token:${parsed.data.token!.slice(0, 24)}`;
  const keyLimit = await checkRateLimitDb(`verify_resend:${limitKey}`, 3, 60 * 60_000);
  if (!keyLimit.ok) return limited(keyLimit.retryAfterMs);

  const token = parsed.data.token;
  after(async () => {
    try {
      const user = email
        ? await prisma.user.findFirst({
            where: { email: emailLookupFilter(email) },
            select: { id: true, email: true, name: true, emailVerified: true, suspendedAt: true, anonymizedAt: true },
          })
        : await (async () => {
            const owner = await findEmailVerifyTokenOwner(token!);
            if (!owner) return null;
            return prisma.user.findUnique({
              where: { id: owner.id },
              select: { id: true, email: true, name: true, emailVerified: true, suspendedAt: true, anonymizedAt: true },
            });
          })();
      if (!user || user.emailVerified || user.suspendedAt || user.anonymizedAt) return;

      await revokeEmailVerificationTokens(user.id, user.email);
      const plain = await issueEmailVerificationToken(user.id);
      const sent = await sendVerificationEmail(
        user.email,
        buildEmailVerifyUrl(getPublicAppOrigin(), plain),
        user.name || undefined
      );
      if (!sent.ok) console.error('[verify-email/resend] send failed');
    } catch (error) {
      const { captureApiError } = await import('@/lib/capture-api-error');
      captureApiError(error, { route: 'POST /api/auth/verify-email/resend', status: 500 });
    }
  });

  return uniformOk();
}
