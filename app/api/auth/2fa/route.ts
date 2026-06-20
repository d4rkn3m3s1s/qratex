import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { generateBase32Secret, verifyTOTP, buildOtpauthUri } from '@/lib/totp';
import { regenerateRecoveryCodes, countUnusedRecoveryCodes } from '@/lib/two-factor';

export const dynamic = 'force-dynamic';

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

    const body = await request.json();

    if (body.action === 'setup') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, twoFactorEnabled: true },
      });
      if (!user) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
      if (user.twoFactorEnabled) return NextResponse.json({ error: '2FA zaten aktif' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });

      const secret = generateBase32Secret();
      // Henüz etkin değil; verify ile onaylanınca enabled olur.
      await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret } });
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

      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true, twoFactorVerifiedAt: new Date() },
      });
      // Kurtarma kodlarını üret ve TEK SEFER döndür (cihaz kaybı için).
      const recoveryCodes = await regenerateRecoveryCodes(userId);
      return NextResponse.json(
        { success: true, message: '2FA etkinleştirildi', recoveryCodes },
        { headers: PRIVATE_NO_STORE_HEADERS }
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
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorVerifiedAt: null },
        }),
        prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      ]);
      return NextResponse.json({ success: true, message: '2FA devre dışı bırakıldı' }, { headers: PRIVATE_NO_STORE_HEADERS });
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
      return NextResponse.json({ success: true, recoveryCodes }, { headers: PRIVATE_NO_STORE_HEADERS });
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
