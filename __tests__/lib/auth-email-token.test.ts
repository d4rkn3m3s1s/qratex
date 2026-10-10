/**
 * lib/auth-email-token — şifre sıfırlamada oturum iptali (P0-07) ve e-posta doğrulamanın
 * idempotent / atomik davranışı (P0-39). Prisma mock'lanır.
 */
const tx = {
  authEmailToken: { findFirst: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
  user: { update: jest.fn(), updateMany: jest.fn() },
};
const prismaMock = {
  authEmailToken: { findFirst: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
  verificationToken: { findUnique: jest.fn(), deleteMany: jest.fn() },
  user: { findFirst: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(async (arg: unknown) => (typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]))),
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

// eslint-disable-next-line import/first
import {
  consumePasswordResetToken,
  hashAuthToken,
  verifyEmailWithToken,
  isPlausibleToken,
} from '@/lib/auth-email-token';

const TOKEN = 'c'.repeat(64);

beforeEach(() => jest.clearAllMocks());

describe('consumePasswordResetToken', () => {
  it('şifreyi yazar, sessionVersion’ı artırır ve diğer bağlantıları iptal eder (çalınmış oturumlar düşer)', async () => {
    tx.authEmailToken.findFirst.mockResolvedValue({ id: 't1', userId: 'u1' });
    tx.authEmailToken.updateMany.mockResolvedValue({ count: 1 });
    const out = await consumePasswordResetToken(TOKEN, 'HASH');
    expect(out).toEqual({ ok: true, userId: 'u1' });
    expect(tx.authEmailToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tokenHash: hashAuthToken(TOKEN) }) })
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { password: 'HASH', sessionVersion: { increment: 1 } },
    });
    expect(tx.authEmailToken.deleteMany).toHaveBeenCalled();
  });

  it('eşzamanlı ikinci istek claim’i kaybeder → şifre yazılmaz', async () => {
    tx.authEmailToken.findFirst.mockResolvedValue({ id: 't1', userId: 'u1' });
    tx.authEmailToken.updateMany.mockResolvedValue({ count: 0 });
    const out = await consumePasswordResetToken(TOKEN, 'HASH');
    expect(out.ok).toBe(false);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('biçimi bozuk token DB’ye gitmeden reddedilir', async () => {
    expect(isPlausibleToken('kisa')).toBe(false);
    const out = await consumePasswordResetToken('kisa', 'HASH');
    expect(out.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('verifyEmailWithToken', () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);

  it('ilk tıklama → verified (atomik claim + koşullu kullanıcı güncellemesi)', async () => {
    prismaMock.authEmailToken.findFirst.mockResolvedValue({
      id: 't1', userId: 'u1', consumedAt: null, expiresAt: future, user: { email: 'a@x.com', emailVerified: null },
    });
    tx.authEmailToken.updateMany.mockResolvedValue({ count: 1 });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    await expect(verifyEmailWithToken(TOKEN)).resolves.toEqual({ status: 'verified', userId: 'u1' });
    expect(tx.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u1', emailVerified: null }, data: { emailVerified: expect.any(Date) } });
  });

  it('ikinci tıklama / bağlantı tarayıcısı → already_verified (eskiden "geçersiz bağlantı")', async () => {
    prismaMock.authEmailToken.findFirst.mockResolvedValue({
      id: 't1', userId: 'u1', consumedAt: new Date(), expiresAt: future, user: { email: 'a@x.com', emailVerified: new Date() },
    });
    await expect(verifyEmailWithToken(TOKEN)).resolves.toEqual({ status: 'already_verified', userId: 'u1' });
  });

  it('eşzamanlı iki istek: claim’i kaybeden 500 değil already_verified alır', async () => {
    prismaMock.authEmailToken.findFirst.mockResolvedValue({
      id: 't1', userId: 'u1', consumedAt: null, expiresAt: future, user: { email: 'a@x.com', emailVerified: null },
    });
    tx.authEmailToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(verifyEmailWithToken(TOKEN)).resolves.toEqual({ status: 'already_verified', userId: 'u1' });
  });

  it('süresi dolmuş → expired + maskeli e-posta (yeniden gönderim için)', async () => {
    prismaMock.authEmailToken.findFirst.mockResolvedValue({
      id: 't1', userId: 'u1', consumedAt: null, expiresAt: past, user: { email: 'ali.yilmaz@ornek.com', emailVerified: null },
    });
    await expect(verifyEmailWithToken(TOKEN)).resolves.toEqual({ status: 'expired', maskedEmail: 'a***z@o***.com' });
  });

  it('eski düz metin VerificationToken da çalışır ve başarıda silinmez (tekrar tıklama idempotent)', async () => {
    prismaMock.authEmailToken.findFirst.mockResolvedValue(null);
    prismaMock.verificationToken.findUnique.mockResolvedValue({ identifier: 'Ali@X.com', token: TOKEN, expires: future });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1', email: 'Ali@X.com', emailVerified: null });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    await expect(verifyEmailWithToken(TOKEN)).resolves.toEqual({ status: 'verified', userId: 'u1' });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: 'ali@x.com', mode: 'insensitive' } } })
    );
    expect(prismaMock.verificationToken.deleteMany).not.toHaveBeenCalled();
  });

  it('bilinmeyen token → invalid', async () => {
    prismaMock.authEmailToken.findFirst.mockResolvedValue(null);
    prismaMock.verificationToken.findUnique.mockResolvedValue(null);
    await expect(verifyEmailWithToken(TOKEN)).resolves.toEqual({ status: 'invalid' });
  });
});
