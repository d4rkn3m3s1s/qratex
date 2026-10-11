import { NextRequest, NextResponse } from 'next/server';
import { revokeNativePushTokens } from '@/lib/push-native-revoke';
import { z } from 'zod';
import { ANY_SIGNED_IN_ROLE, requireAuth } from '@/lib/api-auth';
import { parseJsonBody } from '@/lib/http/parse-body';
import { PASSWORD_MAX_LENGTH, passwordPolicyError } from '@/components/auth/p-auth/password-policy';
import { authOptions, SESSION_MAX_AGE_SECONDS } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { reissueSessionCookie } from '@/lib/auth/session-version';
import { invalidateSessionState } from '@/lib/auth/session-state';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import bcrypt from 'bcryptjs';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkRateLimitDb } from '@/lib/rate-limit';


export const dynamic = 'force-dynamic';

const ChangePasswordBody = z.object({
  currentPassword: z
    .string({ required_error: 'Mevcut şifre ve yeni şifre gereklidir', invalid_type_error: 'Mevcut şifre ve yeni şifre gereklidir' })
    .min(1, 'Mevcut şifre ve yeni şifre gereklidir')
    .max(PASSWORD_MAX_LENGTH * 2, 'Mevcut şifre hatalı'),
  newPassword: z
    .string({ required_error: 'Mevcut şifre ve yeni şifre gereklidir', invalid_type_error: 'Mevcut şifre ve yeni şifre gereklidir' })
    .min(1, 'Mevcut şifre ve yeni şifre gereklidir'),
});

export async function PATCH(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(ANY_SIGNED_IN_ROLE);
    if ('error' in auth) return auth.error;
    const session = auth.session;

    // Brute-force koruması: mevcut-şifre tahmini için oturum-içi deneme sınırı (8 / 5 dk).
    const rl = await checkRateLimitDb(`password_change:${session.user.id}`, 8, 300_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.' },
        { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}) } }
      );
    }

    // mimari-api B6: gövde zod ile; yeni şifre kayıt/sıfırlama/OAuth şifresiyle AYNI politikadan
    // geçer (eskiden burada yalnız 8-200 uzunluk vardı: aynı hesap için iki ayrı politika).
    const parsed = await parseJsonBody(request, ChangePasswordBody, { maxBytes: 4_096 });
    if (!parsed.ok) return parsed.response;
    const { currentPassword, newPassword } = parsed.data;

    const policy = passwordPolicyError(newPassword);
    if (policy) {
      return NextResponse.json(
        {
          success: false,
          code: policy,
          error:
            policy === 'PASSWORD_TOO_LONG'
              ? `Şifre en fazla ${PASSWORD_MAX_LENGTH} karakter olabilir.`
              : 'Şifre en az 8 karakter olmalı; küçük harf, büyük harf ve rakam içermeli.',
        },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true },
    });

    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı veya şifre ayarlı değil' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Mevcut şifre hatalı' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Şifre ve oturum sürümü TEK yazımda (P0-07): şifre değişince diğer cihazlardaki
    // (ör. çalınmış) oturumlar düşer; bu tarayıcının çerezi aşağıda yeni `sv` ile yenilenir.
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { password: hashedPassword, sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CHANGE_PASSWORD',
        entity: 'User',
        entityId: session.user.id,
        ...auditMeta,
      },
    });

    // Sıcak katmanı bayatlat: diğer cihazlardaki eski `sv`'li token'lar 60 sn beklemeden düşsün.
    await invalidateSessionState(session.user.id).catch(() => undefined);
    await revokeNativePushTokens(session.user.id);
    const res = NextResponse.json({ success: true, message: 'Şifre güncellendi' }, { headers: PRIVATE_NO_STORE_HEADERS });
    await reissueSessionCookie(request, res, { sv: updated.sessionVersion }, { maxAge: SESSION_MAX_AGE_SECONDS });
    return res;
  } catch (error) {
    console.error('Error changing password:', error);
    return NextResponse.json(
      { error: 'Şifre güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

