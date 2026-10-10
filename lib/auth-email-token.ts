import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { emailLookupFilter } from '@/lib/auth/normalize-email';
import { maskEmail } from '@/lib/http/dto';

/**
 * Tek kullanımlık e-posta token'ları (hash'li saklanır, düz metin yalnız e-postada).
 *
 * Amaçlar:
 *  - password_reset : şifre sıfırlama (1 sa)
 *  - magic_login    : şifresiz giriş bağlantısı (15 dk)
 *  - email_verify   : kayıt sonrası e-posta doğrulama (24 sa) — eski düz metin
 *                     `VerificationToken` tablosunun yerini alır (geçişte ikisi de okunur)
 *  - mfa_challenge  : OAuth ile 1. adımı geçmiş, 2FA'lı hesabın 2. adım bileti (5 dk)
 *
 * Tüketim her yerde ATOMİK: `updateMany({ where: { id, consumedAt: null, expiresAt > now } })`
 * ve `count === 1` — eşzamanlı iki istekten yalnız biri kazanır (çifte kullanım penceresi yok).
 */
export const AUTH_TOKEN_PURPOSE = {
  PASSWORD_RESET: 'password_reset',
  MAGIC_LOGIN: 'magic_login',
  EMAIL_VERIFY: 'email_verify',
  MFA_CHALLENGE: 'mfa_challenge',
} as const;

export type AuthEmailTokenPurpose = (typeof AUTH_TOKEN_PURPOSE)[keyof typeof AUTH_TOKEN_PURPOSE];

export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Giriş bağlantısı olarak kullanılabilen amaçlar (`/auth/magic?token=`). */
const LOGIN_LINK_PURPOSES: AuthEmailTokenPurpose[] = [
  AUTH_TOKEN_PURPOSE.MAGIC_LOGIN,
  AUTH_TOKEN_PURPOSE.MFA_CHALLENGE,
];

export function hashAuthToken(plain: string): string {
  return createHash('sha256').update(plain.trim(), 'utf8').digest('hex');
}

export function generatePlainToken(): string {
  return randomBytes(32).toString('hex');
}

/** Kaba biçim süzgeci: DB'ye gitmeden önce saçma girdiyi ele (64 hex). */
export function isPlausibleToken(plain: unknown): plain is string {
  return typeof plain === 'string' && /^[a-f0-9]{64}$/i.test(plain.trim());
}

/** Kullanıcının aynı amaçlı eski token'larını silip yenisini üretir; düz metni döndürür. */
export async function createAuthEmailToken(
  userId: string,
  purpose: AuthEmailTokenPurpose,
  ttlMs: number
): Promise<string> {
  const plain = generatePlainToken();
  const tokenHash = hashAuthToken(plain);
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.$transaction(async (tx) => {
    await tx.authEmailToken.deleteMany({ where: { userId, purpose } });
    await tx.authEmailToken.create({
      data: { userId, tokenHash, purpose, expiresAt },
    });
  });

  return plain;
}

// ───────────────────────── Giriş bağlantısı (magic / 2FA bileti) ─────────────────────────

export type LoginLinkUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  image: string | null;
  points: number;
  level: number;
  preferredLanguage: string | null;
  emailVerified: Date | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  suspendedAt: Date | null;
  anonymizedAt: Date | null;
};

export type LoginLinkPeek = {
  tokenId: string;
  purpose: AuthEmailTokenPurpose;
  user: LoginLinkUser;
};

/**
 * Giriş bağlantısını TÜKETMEDEN okur. 2FA'lı hesapta kod gelene kadar token yaşamalı
 * (P0-08: magic link 2FA'yı atlıyordu); tüketim `claimAuthEmailToken` ile ayrı ve atomik.
 */
export async function peekLoginLinkToken(plain: string): Promise<LoginLinkPeek | null> {
  if (!isPlausibleToken(plain)) return null;
  const row = await prisma.authEmailToken.findFirst({
    where: {
      tokenHash: hashAuthToken(plain),
      purpose: { in: LOGIN_LINK_PURPOSES },
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      purpose: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          image: true,
          points: true,
          level: true,
          preferredLanguage: true,
          emailVerified: true,
          twoFactorEnabled: true,
          twoFactorSecret: true,
          suspendedAt: true,
          anonymizedAt: true,
        },
      },
    },
  });
  if (!row?.user) return null;
  return { tokenId: row.id, purpose: row.purpose as AuthEmailTokenPurpose, user: row.user };
}

/** Token'ı atomik olarak tüketir. Başka istek önce tükettiyse/süresi dolduysa `false`. */
export async function claimAuthEmailToken(tokenId: string): Promise<boolean> {
  const res = await prisma.authEmailToken.updateMany({
    where: { id: tokenId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  return res.count === 1;
}

// ───────────────────────────────────── Şifre sıfırlama ─────────────────────────────────────

/** Sıfırlama token'ı geçerli mi? (bcrypt'ten ÖNCE ucuz kontrol — boşa CPU harcanmasın) */
export async function isPasswordResetTokenUsable(plain: string): Promise<boolean> {
  if (!isPlausibleToken(plain)) return false;
  const row = await prisma.authEmailToken.findFirst({
    where: {
      tokenHash: hashAuthToken(plain),
      purpose: AUTH_TOKEN_PURPOSE.PASSWORD_RESET,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return !!row;
}

/**
 * Şifreyi sıfırlar — tek transaction'da:
 *  1. token'ı atomik tüket (eşzamanlı iki istekten yalnız biri),
 *  2. şifreyi yaz + `sessionVersion` artır (P0-07: çalınmış oturumlar düşer),
 *  3. kullanıcının bekleyen diğer giriş/sıfırlama bağlantılarını geçersiz kıl.
 */
export async function consumePasswordResetToken(
  plain: string,
  newPasswordHash: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const INVALID = { ok: false as const, error: 'auth.resetPasswordInvalidToken' };
  if (!isPlausibleToken(plain)) return INVALID;
  const tokenHash = hashAuthToken(plain);

  return prisma.$transaction(async (tx) => {
    const row = await tx.authEmailToken.findFirst({
      where: {
        tokenHash,
        purpose: AUTH_TOKEN_PURPOSE.PASSWORD_RESET,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userId: true },
    });
    if (!row) return INVALID;

    const claimed = await tx.authEmailToken.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) return INVALID;

    await tx.user.update({
      where: { id: row.userId },
      data: { password: newPasswordHash, sessionVersion: { increment: 1 } },
    });
    await tx.authEmailToken.deleteMany({
      where: {
        userId: row.userId,
        consumedAt: null,
        purpose: { in: [AUTH_TOKEN_PURPOSE.PASSWORD_RESET, AUTH_TOKEN_PURPOSE.MAGIC_LOGIN, AUTH_TOKEN_PURPOSE.MFA_CHALLENGE] },
      },
    });
    return { ok: true as const, userId: row.userId };
  });
}

// ───────────────────────────────────── E-posta doğrulama ─────────────────────────────────────

export function buildEmailVerifyUrl(origin: string, plain: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/auth/verify-email?token=${encodeURIComponent(plain)}`;
}

/** Yeni (hash'li) doğrulama token'ı üretir; eskileri siler. */
export function issueEmailVerificationToken(userId: string): Promise<string> {
  return createAuthEmailToken(userId, AUTH_TOKEN_PURPOSE.EMAIL_VERIFY, EMAIL_VERIFY_TTL_MS);
}

export type EmailVerifyOutcome =
  | { status: 'verified'; userId: string }
  | { status: 'already_verified'; userId: string }
  | { status: 'expired'; maskedEmail: string }
  | { status: 'invalid' };

/**
 * Doğrulama bağlantısını işler — İDEMPOTENT:
 *  - ilk tıklama → `verified`
 *  - ikinci tıklama / yenileme / StrictMode çift isteği / bağlantı tarayıcısı → `already_verified`
 *    (eskiden token silindiği için "geçersiz bağlantı" kırmızı ekranı çıkıyordu)
 *  - süresi dolmuş → `expired` + maskeli e-posta (tek tıkla yeniden gönderim için)
 *
 * Geçiş: kayıt yolu hâlâ eski `VerificationToken` (düz metin) üretebilir; o da okunur.
 * Eski token başarıda SİLİNMEZ (tekrar tıklama `already_verified` dönsün diye); süresi
 * dolunca temizlenir.
 */
export async function verifyEmailWithToken(plain: string): Promise<EmailVerifyOutcome> {
  if (typeof plain !== 'string' || !plain.trim() || plain.length > 512) return { status: 'invalid' };
  const now = new Date();

  if (isPlausibleToken(plain)) {
    const row = await prisma.authEmailToken.findFirst({
      where: { tokenHash: hashAuthToken(plain), purpose: AUTH_TOKEN_PURPOSE.EMAIL_VERIFY },
      select: {
        id: true,
        userId: true,
        consumedAt: true,
        expiresAt: true,
        user: { select: { email: true, emailVerified: true } },
      },
    });
    if (row) {
      if (row.consumedAt || row.user.emailVerified) {
        // Tıklama tekrarı veya başka yoldan (OAuth) doğrulanmış.
        if (!row.consumedAt) await claimAuthEmailToken(row.id).catch(() => false);
        return { status: 'already_verified', userId: row.userId };
      }
      if (row.expiresAt <= now) return { status: 'expired', maskedEmail: maskEmail(row.user.email) };

      return prisma.$transaction(async (tx) => {
        const claimed = await tx.authEmailToken.updateMany({
          where: { id: row.id, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (claimed.count !== 1) return { status: 'already_verified' as const, userId: row.userId };
        const upd = await tx.user.updateMany({
          where: { id: row.userId, emailVerified: null },
          data: { emailVerified: now },
        });
        return upd.count === 1
          ? { status: 'verified' as const, userId: row.userId }
          : { status: 'already_verified' as const, userId: row.userId };
      });
    }
  }

  // ── Eski düz metin VerificationToken (geçiş dönemi) ──
  const legacy = await prisma.verificationToken.findUnique({ where: { token: plain.trim() } });
  if (!legacy) return { status: 'invalid' };
  const user = await prisma.user.findFirst({
    where: { email: emailLookupFilter(legacy.identifier) },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!user) return { status: 'invalid' };
  if (user.emailVerified) return { status: 'already_verified', userId: user.id };
  if (legacy.expires <= now) {
    await prisma.verificationToken.deleteMany({ where: { token: legacy.token } }).catch(() => undefined);
    return { status: 'expired', maskedEmail: maskEmail(user.email) };
  }
  const upd = await prisma.user.updateMany({
    where: { id: user.id, emailVerified: null },
    data: { emailVerified: now },
  });
  return upd.count === 1 ? { status: 'verified', userId: user.id } : { status: 'already_verified', userId: user.id };
}

/**
 * Doğrulama token'ından (süresi dolmuş olsa da) hesap sahibini bulur — "süresi doldu,
 * yeni bağlantı gönder" butonunun e-posta yazdırmadan çalışması için.
 */
export async function findEmailVerifyTokenOwner(
  plain: string
): Promise<{ id: string; email: string; name: string | null; emailVerified: Date | null } | null> {
  if (typeof plain !== 'string' || !plain.trim() || plain.length > 512) return null;
  const select = { id: true, email: true, name: true, emailVerified: true } as const;
  if (isPlausibleToken(plain)) {
    const row = await prisma.authEmailToken.findFirst({
      where: { tokenHash: hashAuthToken(plain), purpose: AUTH_TOKEN_PURPOSE.EMAIL_VERIFY },
      select: { user: { select } },
    });
    if (row?.user) return row.user;
  }
  const legacy = await prisma.verificationToken.findUnique({ where: { token: plain.trim() } });
  if (!legacy) return null;
  return prisma.user.findFirst({ where: { email: emailLookupFilter(legacy.identifier) }, select });
}

/** Kullanıcının bekleyen tüm doğrulama token'larını (yeni + eski tablo) siler. */
export async function revokeEmailVerificationTokens(userId: string, email: string): Promise<void> {
  await prisma.$transaction([
    prisma.authEmailToken.deleteMany({ where: { userId, purpose: AUTH_TOKEN_PURPOSE.EMAIL_VERIFY } }),
    prisma.verificationToken.deleteMany({ where: { identifier: emailLookupFilter(email) } }),
  ]);
}
