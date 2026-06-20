/**
 * 2FA çekirdeği — kurtarma kodları üretimi/doğrulaması + login sırasında
 * TOTP-veya-kurtarma-kodu doğrulama. TOTP'nin kendisi lib/totp'tedir.
 *
 * Kurtarma kodları düz saklanmaz; SHA-256 hash (AuthEmailToken deseni). Tek
 * kullanımlık: kullanılınca usedAt damgalanır.
 */
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { verifyTOTP } from '@/lib/totp';

const RECOVERY_CODE_COUNT = 10;

function hashCode(plain: string): string {
  return crypto.createHash('sha256').update(plain.trim().toUpperCase(), 'utf8').digest('hex');
}

/** Okunabilir kurtarma kodu: XXXX-XXXX (kafa karıştıran karakterler hariç). */
function generatePlainRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O/1/I yok
  const pick = (n: number) =>
    Array.from(crypto.randomBytes(n))
      .map((b) => chars[b % chars.length])
      .join('');
  return `${pick(4)}-${pick(4)}`;
}

/**
 * Kullanıcı için yeni kurtarma kodları üretir; eskileri siler. Düz kodları
 * DÖNER (yalnızca bir kez gösterilir), DB'ye hash yazılır.
 */
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const plain = Array.from({ length: RECOVERY_CODE_COUNT }, () => generatePlainRecoveryCode());
  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.twoFactorRecoveryCode.createMany({
      data: plain.map((code) => ({ userId, codeHash: hashCode(code) })),
    }),
  ]);
  return plain;
}

/** Kullanıcının kalan (kullanılmamış) kurtarma kodu sayısı. */
export async function countUnusedRecoveryCodes(userId: string): Promise<number> {
  return prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } });
}

/**
 * Kurtarma kodunu doğrular ve kullanır (tek kullanımlık). Geçerliyse true.
 * Atomik: yalnızca kullanılmamış kod usedAt ile işaretlenir.
 */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const codeHash = hashCode(code);
  const updated = await prisma.twoFactorRecoveryCode.updateMany({
    where: { userId, codeHash, usedAt: null },
    data: { usedAt: new Date() },
  });
  return updated.count > 0;
}

/**
 * Login sırasında 2FA doğrulama: önce TOTP, olmazsa kurtarma kodu.
 * Kullanıcının aktif secret'ı yoksa (2FA kapalı) true döner (engellemez).
 */
export async function verifyTwoFactorForLogin(userId: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) return true; // 2FA kapalı → engelleme yok

  const trimmed = code.trim();
  // 6 haneli → TOTP; aksi halde kurtarma kodu dene.
  if (/^\d{6}$/.test(trimmed)) {
    if (verifyTOTP(user.twoFactorSecret, trimmed)) return true;
  }
  return consumeRecoveryCode(userId, trimmed);
}
