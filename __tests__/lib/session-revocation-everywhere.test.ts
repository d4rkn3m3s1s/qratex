/**
 * P0-07 kapanış doğrulaması — oturum iptali YALNIZ `requireAuth` uçlarında değil, her yerde.
 *
 * Saldırı senaryosu (önceden): kurbanın oturum çerezi çalınır; kurban şifresini sıfırlar
 * (`sessionVersion` artar). `requireAuth` kullanan uçlar eski token'ı reddediyordu, AMA doğrudan
 * `getServerSession` kullanan ~70 uç (ör. /api/customer/shop, /api/customer/settings,
 * /api/notifications, /api/push/subscribe) ve RSC sayfaları token'ı hâlâ geçerli sayıyordu.
 * Anonimleştirilen / askıya alınan hesabın token'ı da bu uçlarda yaşıyordu; rolü düşürülen
 * yönetici bu uçlarda eski rolüyle işlem yapabiliyordu.
 *
 * Şimdi: NextAuth `jwt` callback'i var olan her oturum okunuşunda DB durumunu doğrular
 * (`verifySessionAgainstDb`); geçersiz oturumda hata fırlatır → NextAuth `getServerSession`
 * `null` döner ve `/api/auth/session` çerezi temizler. Rol DB'den tazelenir.
 */

const prismaMock = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  account: { findUnique: jest.fn(), deleteMany: jest.fn() },
  twoFactorRecoveryCode: { deleteMany: jest.fn() },
  authEmailToken: { deleteMany: jest.fn() },
  verificationToken: { deleteMany: jest.fn() },
  $transaction: jest.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const redisStore = new Map<string, unknown>();
const redisGet = jest.fn(async (k: string) => (redisStore.has(k) ? redisStore.get(k) : null));
const redisSet = jest.fn(async (k: string, v: unknown) => {
  redisStore.set(k, v);
});
jest.mock('@/lib/redis', () => ({
  redisGetJson: (k: string) => redisGet(k),
  redisSetJson: (k: string, v: unknown) => redisSet(k, v),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true, remaining: 9 }),
  getLoginLockoutDb: jest.fn().mockResolvedValue({ locked: false }),
  recordFailedLoginAttemptDb: jest.fn().mockResolvedValue(undefined),
  clearFailedLoginAttemptsDb: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/auth-events', () => ({
  logLoginFailed: jest.fn(),
  logLockout: jest.fn(),
  logLoginSuccess: jest.fn(),
  logRateLimit: jest.fn(),
}));
jest.mock('@/lib/auth-email-token', () => ({
  AUTH_TOKEN_PURPOSE: { MAGIC_LOGIN: 'magic_login', MFA_CHALLENGE: 'mfa_challenge' },
  MFA_CHALLENGE_TTL_MS: 300000,
  peekLoginLinkToken: jest.fn(),
  claimAuthEmailToken: jest.fn(),
  createAuthEmailToken: jest.fn(),
}));
jest.mock('@/lib/two-factor', () => ({ verifyTwoFactorForLogin: jest.fn() }));
jest.mock('next/headers', () => ({
  headers: jest.fn(() => Promise.resolve(new Headers())),
  cookies: jest.fn(() => Promise.resolve({ get: () => undefined, delete: () => undefined })),
}));
jest.mock('bcryptjs', () => ({ compare: jest.fn() }));
jest.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: jest.fn(() => ({ createUser: jest.fn(), getUserByEmail: jest.fn() })),
}));
jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: jest.fn((config) => ({ ...config, id: 'credentials', type: 'credentials' })),
}));
jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn((config) => ({ ...config, id: 'google', type: 'oauth' })),
}));
jest.mock('next-auth/providers/github', () => ({
  __esModule: true,
  default: jest.fn((config) => ({ ...config, id: 'github', type: 'oauth' })),
}));

process.env.NEXTAUTH_URL = 'https://app.qratex.com';

// eslint-disable-next-line import/first
import { authOptions } from '@/lib/auth';
// eslint-disable-next-line import/first
import { verifySessionAgainstDb } from '@/lib/auth/session-state';

type DbRow = {
  role: string;
  sessionVersion: number;
  suspendedAt: Date | null;
  anonymizedAt: Date | null;
  staffProfile: { dealerId: string; isActive: boolean } | null;
};

const activeCustomer = (over: Partial<DbRow> = {}): DbRow => ({
  role: 'CUSTOMER',
  sessionVersion: 3,
  suspendedAt: null,
  anonymizedAt: null,
  staffProfile: null,
  ...over,
});

const jwt = authOptions.callbacks!.jwt!;
/** Var olan oturumun okunuşu (getServerSession / /api/auth/session): `user` yok. */
const readSession = (token: Record<string, unknown>) =>
  jwt({ token: { ...token } as never, user: undefined as never, account: null } as never);

beforeEach(() => {
  jest.clearAllMocks();
  redisStore.clear();
});

describe('jwt callback — var olan oturum her okunuşta DB ile doğrulanır', () => {
  it('SALDIRI: şifre sıfırlandı (sv 3 → 4) → çalınan sv=3 token reddedilir', async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeCustomer({ sessionVersion: 4 }));
    await expect(readSession({ id: 'u1', sub: 'u1', role: 'CUSTOMER', sv: 3 })).rejects.toThrow(
      'SESSION_INVALID:SESSION_REVOKED'
    );
  });

  it('SALDIRI: anonimleştirilen hesabın token\'ı reddedilir (PII yeniden yazılamaz)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeCustomer({ anonymizedAt: new Date() }));
    await expect(readSession({ id: 'u1', role: 'CUSTOMER', sv: 3 })).rejects.toThrow('SESSION_INVALID:ACCOUNT_CLOSED');
  });

  it('askıya alınan hesabın token\'ı reddedilir', async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeCustomer({ suspendedAt: new Date() }));
    await expect(readSession({ id: 'u1', role: 'CUSTOMER', sv: 3 })).rejects.toThrow(
      'SESSION_INVALID:ACCOUNT_SUSPENDED'
    );
  });

  it('silinmiş kullanıcının token\'ı reddedilir', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(readSession({ id: 'gone', role: 'CUSTOMER', sv: 0 })).rejects.toThrow('SESSION_INVALID');
  });

  it('SALDIRI: rolü düşürülen yönetici — token\'daki ADMIN rolü DB\'deki CUSTOMER ile ezilir', async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeCustomer());
    const token = await readSession({ id: 'u1', role: 'ADMIN', sv: 3 });
    expect(token.role).toBe('CUSTOMER');
  });

  it('pasife alınan personelin token\'ından işletme bağı düşer', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      activeCustomer({ role: 'STAFF', staffProfile: { dealerId: 'd1', isActive: false } })
    );
    const token = await readSession({ id: 's1', role: 'STAFF', sv: 3, dealerId: 'd1' });
    expect(token.role).toBe('STAFF');
    expect(token.dealerId).toBeUndefined();
  });

  it('geçerli oturum korunur, diğer alanlar değişmez', async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeCustomer());
    const token = await readSession({ id: 'u1', role: 'CUSTOMER', sv: 3, points: 120, name: 'Ayşe' });
    expect(token).toMatchObject({ id: 'u1', role: 'CUSTOMER', sv: 3, points: 120, name: 'Ayşe' });
  });

  it('geçici kesintide (DB okunamıyor) oturum DÜŞÜRÜLMEZ — yetkili kontrol requireAuth\'ta 503', async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error('db down'));
    const token = await readSession({ id: 'u1', role: 'CUSTOMER', sv: 3 });
    expect(token.role).toBe('CUSTOMER');
  });

  it('giriş anında (user var) DB doğrulaması iki kez yapılmaz', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: 'CUSTOMER',
      points: 0,
      level: 1,
      image: null,
      preferredLanguage: 'tr',
      sessionVersion: 7,
      staffProfile: null,
      equippedCosmetics: [],
      customFrameColor: null,
      adminDepartment: null,
      adminTeamRole: null,
    });
    const token = await jwt({ token: {} as never, user: { id: 'u1' } as never, account: null, trigger: 'signIn' } as never);
    expect(token.sv).toBe(7);
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('verifySessionAgainstDb — bayat önbellek meşru oturumu düşürmez', () => {
  it('önbellekte eski sv var, DB\'de yeni sv token ile eşleşiyor → izin (2FA sonrası yeniden imzalanan çerez)', async () => {
    redisStore.set('ss:v1:u1', {
      s: { exists: true, role: 'CUSTOMER', sessionVersion: 3, suspended: false, anonymized: false, staff: null },
    });
    prismaMock.user.findUnique.mockResolvedValue(activeCustomer({ sessionVersion: 4 }));
    const verdict = await verifySessionAgainstDb('u1', 4);
    expect(verdict).toMatchObject({ ok: true, role: 'CUSTOMER' });
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('önbellek isabetinde DB\'ye gidilmez (sıcak katman)', async () => {
    redisStore.set('ss:v1:u1', {
      s: { exists: true, role: 'DEALER', sessionVersion: 2, suspended: false, anonymized: false, staff: null },
    });
    const verdict = await verifySessionAgainstDb('u1', 2);
    expect(verdict).toMatchObject({ ok: true, role: 'DEALER' });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('Redis ve DB erişilemezse null (karar verilemedi)', async () => {
    redisGet.mockRejectedValueOnce(new Error('redis down'));
    expect(await verifySessionAgainstDb('u1', 0)).toBeNull();
  });
});
