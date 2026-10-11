import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { parseJsonBody } from '@/lib/http/parse-body';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { generateBase32Secret, verifyTOTP, buildOtpauthUri, sealTotpSecret } from '@/lib/totp';
import { regenerateRecoveryCodes, countUnusedRecoveryCodes } from '@/lib/two-factor';
import { bumpSessionVersion, reissueSessionCookie } from '@/lib/auth/session-version';
import { invalidateSessionState } from '@/lib/auth/session-state';
import { SESSION_MAX_AGE_SECONDS } from '@/lib/auth';

/**
 * 2FA durumu değişti (aç / kapat / kurtarma kodu yenile) → `sessionVersion` artar (P0-07):
 * diğer cihazlardaki oturumlar düşer. İşlemi yapan tarayıcının çerezi yeni `sv` ile yeniden
 * imzalanır, böylece kullanıcı bu ekranda oturumunu kaybetmez.
 */
async function withSessionRotation(
  request: NextRequest,
  userId: string,
  sv: number,
  res: NextResponse
): Promise<NextResponse> {
  // Oturum durumu sıcak katmanı (≤ 60 sn) eski sürümü tutmasın: diğer cihazlardaki (ör. çalınmış)
  // token'lar ANINDA düşsün; bu tarayıcının yeni `sv`'li çerezi DB'den taze okunarak kabul edilir.
  await invalidateSessionState(userId).catch(() => undefined);
  await reissueSessionCookie(request, res, { sv }, { maxAge: SESSION_MAX_AGE_SECONDS });
  return res;
}

export const dynamic = 'force-dynamic';

const TwoFactorBodySchema = z.object({
  action: z.enum(['setup', 'verify', 'disable', 'recovery-codes'], { errorMap: () => ({ message: 'Geçersiz action' }) }),
  code: z.string().max(32).optional(),
});

/**
 * 2FA yönetimi (oturum açık kullanıcı). TOTP lib/totp'te, kurtarma kodları
 * lib/two-factor'da. Login doğrulaması lib/auth authorize()'da yapılır.
 *
 * action: setup | verify | disable | recovery-codes
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['CUSTOMER', 'DEALER', 'ADMIN', 'STAFF']);
    if ('error' in auth) return auth.error;
    const userId = auth.session.user.id;

    // 2FA işlemleri hassas → brute-force/spam koruması.
    const rl = await checkRateLimitDb(`2fa_action:${userId}`, 12, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen bir dakika bekleyin.' },
        { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
      );
    }

    // mimari-api B6: gövde zod ile (bozuk JSON / bilinmeyen eylem 500 değil 400).
    const parsed = await parseJsonBody(request, TwoFactorBodySchema, { maxBytes: 4_096 });
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    if (body.action === 'setup') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, twoFactorEnabled: true },
      });
      if (!user) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
      if (user.twoFactorEnabled) return NextResponse.json({ error: '2FA zaten aktif' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });

      const secret = generateBase32Secret();
      // Henüz etkin değil; verify ile onaylanınca enabled olur. DB'ye mühürlü yazılır
      // (veri modeli B14); kullanıcıya QR için yalnız bu yanıtta düz gösterilir.
      await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: sealTotpSecret(secret) } });
      return NextResponse.json(
        { success: true, secret, otpauthUri: buildOtpauthUri(user.email || '', secret) },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    if (body.action === 'verify') {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: 'Geçersiz doğrulama kodu' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorSecret: true, twoFactorEnabled: true },
      });
      if (!user?.twoFactorSecret) return NextResponse.json({ error: 'Önce kurulum yapın' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      if (user.twoFactorEnabled) return NextResponse.json({ error: '2FA zaten aktif' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      if (!verifyTOTP(user.twoFactorSecret, code)) {
        return NextResponse.json({ error: 'Yanlış kod, tekrar deneyin' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      }

      // 2FA açılışı ve oturum sürümü artışı TEK yazımda: biri olup diğeri olmayan ara durum yok.
      const enabled = await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true, twoFactorVerifiedAt: new Date(), sessionVersion: { increment: 1 } },
        select: { sessionVersion: true },
      });
      // Kurtarma kodlarını üret ve TEK SEFER döndür (cihaz kaybı için).
      const recoveryCodes = await regenerateRecoveryCodes(userId);
      return withSessionRotation(
        request,
        userId,
        enabled.sessionVersion,
        NextResponse.json({ success: true, message: '2FA etkinleştirildi', recoveryCodes }, { headers: PRIVATE_NO_STORE_HEADERS })
      );
    }

    if (body.action === 'disable') {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: 'Geçersiz doğrulama kodu' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorSecret: true, twoFactorEnabled: true },
      });
      if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
        return NextResponse.json({ error: '2FA aktif değil' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      }
      if (!verifyTOTP(user.twoFactorSecret, code)) {
        return NextResponse.json({ error: 'Yanlış kod' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      }
      const [disabled] = await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: {
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorVerifiedAt: null,
            sessionVersion: { increment: 1 },
          },
          select: { sessionVersion: true },
        }),
        prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      ]);
      return withSessionRotation(
        request,
        userId,
        disabled.sessionVersion,
        NextResponse.json({ success: true, message: '2FA devre dışı bırakıldı' }, { headers: PRIVATE_NO_STORE_HEADERS })
      );
    }

    if (body.action === 'recovery-codes') {
      // Mevcut TOTP doğrulamasıyla kurtarma kodlarını yeniden üret.
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorSecret: true, twoFactorEnabled: true },
      });
      if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
        return NextResponse.json({ error: '2FA aktif değil' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      }
      if (!verifyTOTP(user.twoFactorSecret, code)) {
        return NextResponse.json({ error: 'Yanlış kod' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      }
      const recoveryCodes = await regenerateRecoveryCodes(userId);
      const sv = await bumpSessionVersion(userId);
      return withSessionRotation(
        request,
        userId,
        sv,
        NextResponse.json({ success: true, recoveryCodes }, { headers: PRIVATE_NO_STORE_HEADERS })
      );
    }

    return NextResponse.json({ error: 'Geçersiz action' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('2FA error:', error);
    return NextResponse.json({ error: '2FA işlemi başarısız' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/** GET — kullanıcının 2FA durumu (UI rozeti / kalan kurtarma kodu sayısı). */
export async function GET() {
  try {
    const auth = await requireAuth(['CUSTOMER', 'DEALER', 'ADMIN', 'STAFF']);
    if ('error' in auth) return auth.error;
    const userId = auth.session.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } });
    const remainingRecoveryCodes = user?.twoFactorEnabled ? await countUnusedRecoveryCodes(userId) : 0;
    return NextResponse.json(
      { enabled: !!user?.twoFactorEnabled, remainingRecoveryCodes },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('2FA status error:', error);
    return NextResponse.json({ error: '2FA durumu alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
