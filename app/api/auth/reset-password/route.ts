import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { hashPassword } from '@/lib/password';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { consumePasswordResetToken, isPasswordResetTokenUsable } from '@/lib/auth-email-token';
import { invalidateSessionState } from '@/lib/auth/session-state';
import { revokeNativePushTokens } from '@/lib/push-native-revoke';
import { checkAuthEmailActionLimit, getClientIdentifier } from '@/lib/rate-limit';
import { passwordPolicyError } from '@/components/auth/p-auth/password-policy';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { getPublicAppOrigin } from '@/lib/public-app-origin';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  token: z.string().trim().min(16).max(512),
  newPassword: z.string().min(8).max(128),
});

const INVALID_LINK = 'Bağlantı geçersiz, kullanılmış veya süresi dolmuş. Yeni bir sıfırlama bağlantısı iste.';

/**
 * Şifreyi sıfırlar. `consumePasswordResetToken` tek transaction'da token'ı atomik tüketir,
 * şifreyi yazar ve `sessionVersion`'ı artırır (P0-07): sıfırlamadan önce açılmış BÜTÜN
 * oturumlar (çalınmış olanlar dahil) geçersizleşir. Bekleyen magic/sıfırlama bağlantıları da iptal.
 * Yanıttan sonra (`after`): denetim kaydı + "şifren değiştirildi" güvenlik e-postası (sahibi
 * değişikliği yapmadıysa hemen yeni sıfırlama başlatabilsin).
 */
export async function POST(request: NextRequest) {
  // Rate limit — token tahmin/deneme ve DB yükünü sınırla (IP başına 15 dk penceresi).
  const ip = getClientIdentifier(request);
  const rl = await checkAuthEmailActionLimit('reset_password', ip);
  if (!rl.ok) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', error: 'Çok fazla deneme. Lütfen biraz sonra tekrar dene.' },
      { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const tooShort = parsed.error?.errors.some((e) => e.path[0] === 'newPassword');
    return NextResponse.json(
      tooShort
        ? { code: 'WEAK_PASSWORD', error: 'Şifre en az 8, en fazla 128 karakter olmalı.' }
        : { code: 'INVALID_LINK', error: INVALID_LINK },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  // Kayıtla aynı şifre politikası (en az 8 + küçük/büyük harf + rakam). Eskiden sıfırlama yalnız
  // uzunluğa bakıyordu → aynı hesap için iki farklı politika.
  const policy = passwordPolicyError(parsed.data.newPassword);
  if (policy) {
    return NextResponse.json(
      {
        code: policy,
        error:
          policy === 'PASSWORD_TOO_LONG'
            ? 'Şifre en fazla 128 karakter olabilir.'
            : 'Şifre en az 8 karakter olmalı; küçük harf, büyük harf ve rakam içermeli.',
      },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  // Ucuz kontrol önce: geçersiz token için bcrypt (pahalı) çalıştırılmaz.
  if (!(await isPasswordResetTokenUsable(parsed.data.token))) {
    return NextResponse.json({ code: 'INVALID_LINK', error: INVALID_LINK }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  try {
    const hashed = await hashPassword(parsed.data.newPassword);
    const result = await consumePasswordResetToken(parsed.data.token, hashed);
    if (!result.ok) {
      return NextResponse.json({ code: 'INVALID_LINK', error: INVALID_LINK }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    // P0-07: sıcak katmanı bayatlat → çalınmış eski oturumlar 60 sn beklemeden ANINDA düşer.
    await invalidateSessionState(result.userId).catch(() => undefined);
    await revokeNativePushTokens(result.userId);
    scheduleAfterReset(result.userId, getAuditRequestMeta(request));
    return NextResponse.json(
      { success: true, code: 'PASSWORD_RESET', message: 'Şifren güncellendi. Diğer cihazlardaki oturumlar kapatıldı; yeni şifrenle giriş yapabilirsin.' },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'POST /api/auth/reset-password', status: 500 });
    return NextResponse.json(
      { code: 'SERVER_ERROR', error: 'Şifre güncellenemedi. Lütfen tekrar dene.' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

function scheduleAfterReset(userId: string, meta: ReturnType<typeof getAuditRequestMeta>) {
  try {
    after(async () => {
      try {
        const { prisma } = await import('@/lib/prisma');
        await prisma.auditLog
          .create({
            data: { userId, action: 'PASSWORD_RESET', entity: 'User', entityId: userId, newData: { source: 'email_link' } as object, ...meta },
          })
          .catch((e: unknown) => console.error('[reset-password] audit log failed', e));
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
        if (!user?.email) return;
        const { sendPasswordChangedEmail } = await import('@/lib/email');
        const sent = await sendPasswordChangedEmail(user.email, {
          userName: user.name ?? undefined,
          forgotUrl: `${getPublicAppOrigin()}/auth/forgot-password`,
        });
        if (!sent.ok) console.error('[reset-password] password-changed notice failed');
      } catch (e) {
        console.error('[reset-password] after-reset tasks failed', e);
      }
    });
  } catch {
    // İstek kapsamı yok (betik/test) — bildirim isteğe bağlıdır, sıfırlama zaten tamamlandı.
  }
}
