/**
 * A1 kimlik akışları — P0-02 / P0-07 (JWT) / P0-08 saldırı ve hata senaryolarının
 * yeniden üretimi. Prisma ve dış bağımlılıklar mock'lanır; gerçek DB'ye gidilmez.
 */
import bcrypt from 'bcryptjs';

// ── Mock'lar ────────────────────────────────────────────────────────────────
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

const rateLimit = {
  checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true, remaining: 9 }),
  getLoginLockoutDb: jest.fn().mockResolvedValue({ locked: false }),
  recordFailedLoginAttemptDb: jest.fn().mockResolvedValue(undefined),
  clearFailedLoginAttemptsDb: jest.fn().mockResolvedValue(undefined),
};
jest.mock('@/lib/rate-limit', () => rateLimit);
jest.mock('@/lib/auth-events', () => ({
  logLoginFailed: jest.fn(),
  logLockout: jest.fn(),
  logLoginSuccess: jest.fn(),
  logRateLimit: jest.fn(),
}));

const tokenMock = {
  peekLoginLinkToken: jest.fn(),
  claimAuthEmailToken: jest.fn(),
  createAuthEmailToken: jest.fn(),
};
jest.mock('@/lib/auth-email-token', () => ({
  AUTH_TOKEN_PURPOSE: {
    PASSWORD_RESET: 'password_reset',
    MAGIC_LOGIN: 'magic_login',
    EMAIL_VERIFY: 'email_verify',
    MFA_CHALLENGE: 'mfa_challenge',
  },
  MFA_CHALLENGE_TTL_MS: 300000,
  peekLoginLinkToken: (...a: unknown[]) => tokenMock.peekLoginLinkToken(...a),
  claimAuthEmailToken: (...a: unknown[]) => tokenMock.claimAuthEmailToken(...a),
  createAuthEmailToken: (...a: unknown[]) => tokenMock.createAuthEmailToken(...a),
}));

const verifyTwoFactorForLogin = jest.fn();
jest.mock('@/lib/two-factor', () => ({
  verifyTwoFactorForLogin: (...a: unknown[]) => verifyTwoFactorForLogin(...a),
}));

const cookieJar = new Map<string, string>();
jest.mock('next/headers', () => ({
  headers: jest.fn(() => Promise.resolve(new Headers({ 'x-forwarded-for': '10.0.0.1' }))),
  cookies: jest.fn(() =>
    Promise.resolve({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined) })
  ),
}));

jest.mock('bcryptjs', () => ({ compare: jest.fn() }));

const baseCreateUser = jest.fn(async (data: Record<string, unknown>) => ({ id: 'new-user', ...data }));
jest.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: jest.fn(() => ({ createUser: baseCreateUser, getUserByEmail: jest.fn() })),
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
import { authOptions, authAdapter, resolveOAuthSignIn, SIGNUP_INTENT_COOKIE } from '@/lib/auth';
// eslint-disable-next-line import/first
import { safePostLoginRedirect } from '@/lib/safe-callback-url';
// eslint-disable-next-line import/first
import { encodeAuthError, parseAuthError, AUTH_ERROR } from '@/lib/auth/login-errors';

type AuthorizeFn = (c: Record<string, string | undefined> | undefined) => Promise<unknown>;
const authorize = (authOptions.providers.find((p) => p.type === 'credentials') as unknown as { authorize: AuthorizeFn })
  .authorize;
const compare = bcrypt.compare as jest.Mock;

function dbUser(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'ali@x.com',
    name: 'Ali',
    password: '$2a$12$hash',
    role: 'CUSTOMER',
    image: null,
    points: 10,
    level: 1,
    preferredLanguage: 'tr',
    emailVerified: new Date('2026-01-01'),
    twoFactorEnabled: false,
    twoFactorSecret: null,
    suspendedAt: null,
    anonymizedAt: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  cookieJar.clear();
  rateLimit.checkRateLimitDb.mockResolvedValue({ ok: true, remaining: 9 });
  rateLimit.getLoginLockoutDb.mockResolvedValue({ locked: false });
});

// ── P0-02: açık yönlendirme ────────────────────────────────────────────────
describe('P0-02 · safePostLoginRedirect artık ortak süzgeci kullanıyor', () => {
  const origin = 'https://app.qratex.com';
  it.each([
    ['/\\evil.com'],
    ['/%5Cevil.com'],
    ['/\t/evil.com'],
    ['//evil.com'],
    ['javascript:alert(document.cookie)'],
    ['https://evil.com/oturum-suresi-doldu'],
    ['https://app.qratex.com@evil.com/'],
  ])('reddeder: %s', (raw) => {
    expect(safePostLoginRedirect(raw, origin)).toBeUndefined();
  });

  it('meşru yolları ve aynı kökenli mutlak URL’yi korur', () => {
    expect(safePostLoginRedirect('/customer/rewards?tab=1', origin)).toBe('/customer/rewards?tab=1');
    expect(safePostLoginRedirect('https://app.qratex.com/feedback/abc', origin)).toBe('/feedback/abc');
  });

  it('NextAuth redirect callback başka kökene ve ters bölüye izin vermez', async () => {
    const redirect = authOptions.callbacks!.redirect!;
    const baseUrl = 'https://app.qratex.com';
    await expect(redirect({ url: 'https://evil.com/x', baseUrl })).resolves.toBe(baseUrl);
    await expect(redirect({ url: '/\\evil.com', baseUrl })).resolves.toBe(baseUrl);
    await expect(redirect({ url: '/auth/complete?next=%2Fcustomer', baseUrl })).resolves.toBe(
      `${baseUrl}/auth/complete?next=%2Fcustomer`
    );
  });
});

// ── Hata kodu sözleşmesi ───────────────────────────────────────────────────
describe('login-errors', () => {
  it('kodu ve bekleme süresini kodlar/çözer; bilinmeyen metni UNKNOWN yapar', () => {
    expect(encodeAuthError(AUTH_ERROR.LOCKED, 119.2)).toBe('LOCKED:120');
    expect(parseAuthError('LOCKED:120')).toEqual({ code: 'LOCKED', retryAfterSec: 120 });
    expect(parseAuthError('2FA_REQUIRED')).toEqual({ code: '2FA_REQUIRED' });
    expect(parseAuthError('OAuthAccountNotLinked')).toEqual({ code: 'OAuthAccountNotLinked' });
    expect(parseAuthError('E-posta veya şifre hatalı')).toEqual({ code: 'UNKNOWN' });
    expect(parseAuthError('')).toBeNull();
  });
});

// ── authorize ─────────────────────────────────────────────────────────────
describe('authorize · e-posta/şifre', () => {
  it('karışık harfli e-postayı normalize eder; kilit anahtarı küçük harflidir', async () => {
    prismaMock.user.findFirst.mockResolvedValue(dbUser());
    compare.mockResolvedValue(true);
    const out = await authorize({ email: '  Ali@X.COM ', password: 'secret123' });
    expect(out).toMatchObject({ id: 'u1', email: 'ali@x.com' });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: 'ali@x.com', mode: 'insensitive' } } })
    );
    expect(rateLimit.getLoginLockoutDb).toHaveBeenCalledWith('10.0.0.1:ali@x.com');
  });

  it('doğrulanmamış hesapta YANLIŞ şifre → INVALID_CREDENTIALS (hesap durumu sızmaz)', async () => {
    prismaMock.user.findFirst.mockResolvedValue(dbUser({ emailVerified: null }));
    compare.mockResolvedValue(false);
    await expect(authorize({ email: 'ali@x.com', password: 'wrong' })).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('doğrulanmamış hesapta DOĞRU şifre → EMAIL_NOT_VERIFIED ve kilit sayacına yazılmaz', async () => {
    prismaMock.user.findFirst.mockResolvedValue(dbUser({ emailVerified: null }));
    compare.mockResolvedValue(true);
    await expect(authorize({ email: 'ali@x.com', password: 'right' })).rejects.toThrow('EMAIL_NOT_VERIFIED');
    expect(rateLimit.recordFailedLoginAttemptDb).not.toHaveBeenCalled();
  });

  it('kilitli hesap kalan süreyle LOCKED döner', async () => {
    rateLimit.getLoginLockoutDb.mockResolvedValue({ locked: true, retryAfterMs: 119_500 });
    await expect(authorize({ email: 'ali@x.com', password: 'x' })).rejects.toThrow('LOCKED:120');
  });

  it('askıya alınmış hesap doğru şifreyle de giremez', async () => {
    prismaMock.user.findFirst.mockResolvedValue(dbUser({ suspendedAt: new Date() }));
    compare.mockResolvedValue(true);
    await expect(authorize({ email: 'ali@x.com', password: 'right' })).rejects.toThrow('ACCOUNT_SUSPENDED');
  });

  it('2FA açık + kod yok → 2FA_REQUIRED; yanlış kod → INVALID_2FA', async () => {
    prismaMock.user.findFirst.mockResolvedValue(dbUser({ twoFactorEnabled: true, twoFactorSecret: 'S' }));
    compare.mockResolvedValue(true);
    await expect(authorize({ email: 'ali@x.com', password: 'right' })).rejects.toThrow('2FA_REQUIRED');
    verifyTwoFactorForLogin.mockResolvedValue(false);
    await expect(authorize({ email: 'ali@x.com', password: 'right', twoFactorCode: '000000' })).rejects.toThrow(
      'INVALID_2FA'
    );
  });
});

describe('P0-08 · magic link 2FA’yı atlayamaz', () => {
  const TOKEN = 'a'.repeat(64);
  const peek = (over: Record<string, unknown> = {}) => ({
    tokenId: 't1',
    purpose: 'magic_login',
    user: dbUser({ twoFactorEnabled: true, twoFactorSecret: 'S', ...over }),
  });

  it('2FA’lı hesapta kodsuz bağlantı → 2FA_REQUIRED ve token TÜKETİLMEZ', async () => {
    tokenMock.peekLoginLinkToken.mockResolvedValue(peek());
    await expect(authorize({ magicToken: TOKEN })).rejects.toThrow('2FA_REQUIRED');
    expect(tokenMock.claimAuthEmailToken).not.toHaveBeenCalled();
  });

  it('yanlış kod → INVALID_2FA, deneme sayılır, token tüketilmez', async () => {
    tokenMock.peekLoginLinkToken.mockResolvedValue(peek());
    verifyTwoFactorForLogin.mockResolvedValue(false);
    await expect(authorize({ magicToken: TOKEN, twoFactorCode: '123456' })).rejects.toThrow('INVALID_2FA');
    expect(rateLimit.recordFailedLoginAttemptDb).toHaveBeenCalledWith('10.0.0.1:ali@x.com');
    expect(tokenMock.claimAuthEmailToken).not.toHaveBeenCalled();
  });

  it('doğru kod → token atomik tüketilir, giriş başarılı', async () => {
    tokenMock.peekLoginLinkToken.mockResolvedValue(peek());
    verifyTwoFactorForLogin.mockResolvedValue(true);
    tokenMock.claimAuthEmailToken.mockResolvedValue(true);
    await expect(authorize({ magicToken: TOKEN, twoFactorCode: '123456' })).resolves.toMatchObject({ id: 'u1' });
    expect(tokenMock.claimAuthEmailToken).toHaveBeenCalledWith('t1');
  });

  it('eşzamanlı ikinci kullanım (claim kaybedildi) → INVALID_LINK', async () => {
    tokenMock.peekLoginLinkToken.mockResolvedValue(peek({ twoFactorEnabled: false, twoFactorSecret: null }));
    tokenMock.claimAuthEmailToken.mockResolvedValue(false);
    await expect(authorize({ magicToken: TOKEN })).rejects.toThrow('INVALID_LINK');
  });

  it('geçersiz bağlantı → INVALID_LINK', async () => {
    tokenMock.peekLoginLinkToken.mockResolvedValue(null);
    await expect(authorize({ magicToken: TOKEN })).rejects.toThrow('INVALID_LINK');
  });
});

// ── P0-07 (JWT tarafı) ─────────────────────────────────────────────────────
describe('P0-07 · JWT’ye sessionVersion (sv) yazılır', () => {
  it('girişte DB’deki sessionVersion token.sv olur; update tetiklemesi sv’yi değiştiremez', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: 'CUSTOMER',
      points: 1,
      level: 1,
      image: null,
      preferredLanguage: 'tr',
      sessionVersion: 4,
      staffProfile: null,
      equippedCosmetics: [],
      customFrameColor: null,
      adminDepartment: null,
      adminTeamRole: null,
    });
    const jwt = authOptions.callbacks!.jwt!;
    const token = await jwt({ token: {} as never, user: { id: 'u1' } as never, account: null, trigger: 'signIn' } as never);
    expect(token.sv).toBe(4);
    const updated = await jwt({ token, user: undefined as never, trigger: 'update', session: { sv: 99, role: 'ADMIN' } } as never);
    expect(updated.sv).toBe(4);
    expect(updated.role).toBe('CUSTOMER');
  });
});

// ── P0-08: OAuth hesap ön-ele geçirme ──────────────────────────────────────
describe('P0-08 · OAuth bağlama politikası', () => {
  const google = { provider: 'google', providerAccountId: 'g-1', type: 'oauth' } as never;
  const github = { provider: 'github', providerAccountId: 'gh-1', type: 'oauth' } as never;

  it('Google e-postayı doğrulanmış bildirmezse giriş reddedilir', async () => {
    const out = await resolveOAuthSignIn({ user: null, account: google, profile: { email: 'v@x.com', email_verified: false } });
    expect(out).toBe('https://app.qratex.com/auth/login?error=OAuthEmailUnverified');
  });

  it('saldırganın doğrulanmamış satırı sahiplenilir: şifre null, 2FA sıfır, diğer bağlantılar silinir, sv artar', async () => {
    prismaMock.account.findUnique.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'victim-row',
      email: 'Kurban@x.com',
      emailVerified: null,
      twoFactorEnabled: true,
      twoFactorSecret: 'ATTACKER',
      suspendedAt: null,
      anonymizedAt: null,
    });
    const out = await resolveOAuthSignIn({ user: null, account: google, profile: { email: 'kurban@x.com', email_verified: true } });
    expect(out).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'victim-row' },
      data: expect.objectContaining({
        password: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        sessionVersion: { increment: 1 },
        emailVerified: expect.any(Date),
      }),
    });
    expect(prismaMock.account.deleteMany).toHaveBeenCalledWith({ where: { userId: 'victim-row', provider: { not: 'google' } } });
    expect(prismaMock.authEmailToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'victim-row' } });
  });

  it('doğrulanmış 2FA’lı hesap OAuth ile 2. adıma yönlendirilir (oturum açılmaz)', async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      user: { id: 'u1', email: 'a@x.com', emailVerified: new Date(), twoFactorEnabled: true, twoFactorSecret: 'S', suspendedAt: null, anonymizedAt: null },
    });
    tokenMock.createAuthEmailToken.mockResolvedValue('b'.repeat(64));
    cookieJar.set('__Secure-next-auth.callback-url', 'https://app.qratex.com/auth/complete?next=%2Fcustomer');
    const out = await resolveOAuthSignIn({ user: null, account: google, profile: { email: 'a@x.com', email_verified: true } });
    expect(typeof out).toBe('string');
    const url = new URL(out as string);
    expect(url.pathname).toBe('/auth/magic');
    expect(url.searchParams.get('via')).toBe('oauth');
    expect(url.searchParams.get('callbackUrl')).toBe('/auth/complete?next=%2Fcustomer');
    expect(tokenMock.createAuthEmailToken).toHaveBeenCalledWith('u1', 'mfa_challenge', 300000);
  });

  it('GitHub e-postayla mevcut hesaba bağlanmaya çalışırsa satıra dokunulmaz (NextAuth bağlamayı reddeder)', async () => {
    prismaMock.account.findUnique.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'row', email: 'a@x.com', emailVerified: null, twoFactorEnabled: false, twoFactorSecret: null, suspendedAt: null, anonymizedAt: null,
    });
    const out = await resolveOAuthSignIn({ user: null, account: github, profile: { email: 'a@x.com' } });
    expect(out).toBe(true);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    const gh = authOptions.providers.find((p) => p.id === 'github') as unknown as { allowDangerousEmailAccountLinking?: boolean } | undefined;
    if (gh) expect(gh.allowDangerousEmailAccountLinking).toBe(false);
  });

  it('askıya alınmış hesap OAuth ile de giremez', async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      user: { id: 'u1', email: 'a@x.com', emailVerified: new Date(), twoFactorEnabled: false, twoFactorSecret: null, suspendedAt: new Date(), anonymizedAt: null },
    });
    const out = await resolveOAuthSignIn({ user: null, account: google, profile: { email: 'a@x.com', email_verified: true } });
    expect(out).toBe('https://app.qratex.com/auth/login?error=AccountSuspended');
  });

  it('linkAccount olayı yalnız Google için emailVerified doldurur', async () => {
    await authOptions.events!.linkAccount!({ user: { id: 'u1' }, account: { provider: 'github' }, profile: {} } as never);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    await authOptions.events!.linkAccount!({ user: { id: 'u1' }, account: { provider: 'google' }, profile: {} } as never);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u1', emailVerified: null }, data: { emailVerified: expect.any(Date) } });
  });
});

// ── OAuth ile DEALER kaydı + e-posta normalizasyonu (adapter) ───────────────
describe('authAdapter', () => {
  it('kayıt niyeti çerezi DEALER ise YENİ OAuth kullanıcısı işletme olarak oluşur; e-posta normalize edilir', async () => {
    cookieJar.set(SIGNUP_INTENT_COOKIE, 'DEALER');
    await authAdapter.createUser!({ id: 'x', email: 'Isletme@X.com', emailVerified: null } as never);
    expect(baseCreateUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'isletme@x.com', role: 'DEALER' }));
  });

  it('niyet yoksa rol verilmez (şema varsayılanı CUSTOMER)', async () => {
    await authAdapter.createUser!({ id: 'x', email: 'a@x.com', emailVerified: null } as never);
    expect(baseCreateUser.mock.calls[0][0]).not.toHaveProperty('role');
  });

  it('getUserByEmail büyük/küçük harf duyarsız arar', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' });
    await authAdapter.getUserByEmail!('ALI@x.com');
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({ where: { email: { equals: 'ali@x.com', mode: 'insensitive' } } });
  });
});
