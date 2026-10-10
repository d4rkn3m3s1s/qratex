/**
 * P0-07 (JWT tarafı) — kimlik bilgisi değişince `sessionVersion` artar ve işlemi yapan
 * tarayıcının çerezi yeni `sv` ile yeniden imzalanır; diğer cihazlardaki (ör. çalınmış)
 * oturumlar `requireAuth`'un sv karşılaştırmasında düşer.
 *
 * Senaryo: saldırgan kurbanın oturum çerezini çaldı (sv=4). Kurban 2FA'yı açar/kapatır veya
 * şifresini değiştirir → DB sv=5 olur, kurbanın çerezi sv=5 ile yenilenir, saldırganın
 * elindeki sv=4 token'ı geçersiz kalır. Artış durum değişikliğiyle AYNI yazımdadır (biri olup
 * diğeri olmayan ara durum yok). Prisma mock'lanır; gerçek DB'ye gidilmez.
 */
import { NextRequest } from 'next/server';
import { encode, decode } from 'next-auth/jwt';

const SECRET = 's'.repeat(48);
process.env.NEXTAUTH_SECRET = SECRET;

const prismaMock = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  twoFactorRecoveryCode: { deleteMany: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/auth', () => ({ authOptions: {}, SESSION_MAX_AGE_SECONDS: 3600 }));
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: { user: { id: 'victim', role: 'CUSTOMER' } } })),
}));
jest.mock('next-auth', () => ({ getServerSession: jest.fn(async () => ({ user: { id: 'victim' } })) }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true }),
  checkAuthEmailActionLimit: jest.fn().mockResolvedValue({ ok: true }),
  getClientIdentifier: jest.fn(() => '10.0.0.1'),
}));
const mockConsumeReset = jest.fn();
jest.mock('@/lib/auth-email-token', () => ({
  isPasswordResetTokenUsable: jest.fn(async () => true),
  consumePasswordResetToken: (...a: unknown[]) => mockConsumeReset(...a),
}));
jest.mock('@/lib/password', () => ({ hashPassword: jest.fn(async () => '$2a$12$reset') }));
jest.mock('@/lib/totp', () => ({
  generateBase32Secret: jest.fn(() => 'SECRET'),
  verifyTOTP: jest.fn(() => true),
  buildOtpauthUri: jest.fn(() => 'otpauth://x'),
}));
jest.mock('@/lib/two-factor', () => ({
  regenerateRecoveryCodes: jest.fn(async () => ['a-b-c']),
  countUnusedRecoveryCodes: jest.fn(async () => 1),
}));
jest.mock('@/lib/request-metadata', () => ({ getAuditRequestMeta: () => ({}) }));
// Sıcak katman (≤ 60 sn) bayatlatılmazsa çalınan eski `sv`'li token o süre boyunca çalışırdı.
const mockInvalidate = jest.fn(async (_id: string) => undefined);
jest.mock('@/lib/auth/session-state', () => ({ invalidateSessionState: (id: string) => mockInvalidate(id) }));
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: { compare: jest.fn(async () => true), hash: jest.fn(async () => '$2a$12$new') },
}));

const COOKIE = '__Secure-next-auth.session-token';

async function requestWithSession(path: string, method: string, body: unknown) {
  const token = await encode({ token: { id: 'victim', role: 'CUSTOMER', sv: 4 }, secret: SECRET });
  return new NextRequest(new URL(`https://app.qratex.com${path}`), {
    method,
    headers: { 'content-type': 'application/json', cookie: `${COOKIE}=${token}` },
    body: JSON.stringify(body),
  });
}

async function cookieSv(res: Response & { cookies: { get(n: string): { value: string } | undefined } }) {
  const c = res.cookies.get(COOKIE);
  if (!c?.value) return null;
  const t = await decode({ token: c.value, secret: SECRET });
  return t?.sv ?? null;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/auth/2fa', () => {
  it('2FA açılınca sv aynı güncellemede artar, bu tarayıcının çerezi yeni sv alır', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ twoFactorSecret: 'SECRET', twoFactorEnabled: false });
    prismaMock.user.update.mockResolvedValue({ sessionVersion: 5 });
    const { POST } = await import('@/app/api/auth/2fa/route');
    const res = await POST(await requestWithSession('/api/auth/2fa', 'POST', { action: 'verify', code: '123456' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'victim' },
        data: expect.objectContaining({ twoFactorEnabled: true, sessionVersion: { increment: 1 } }),
      })
    );
    expect(await cookieSv(res as never)).toBe(5);
  });

  it('2FA kapatma: sırrın silinmesi ve sv artışı tek transaction içinde', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ twoFactorSecret: 'SECRET', twoFactorEnabled: true });
    prismaMock.user.update.mockResolvedValue({ sessionVersion: 9 });
    prismaMock.twoFactorRecoveryCode.deleteMany.mockResolvedValue({ count: 3 });
    const { POST } = await import('@/app/api/auth/2fa/route');
    const res = await POST(await requestWithSession('/api/auth/2fa', 'POST', { action: 'disable', code: '123456' }));
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ twoFactorEnabled: false, twoFactorSecret: null, sessionVersion: { increment: 1 } }),
      })
    );
    expect(await cookieSv(res as never)).toBe(9);
    expect(mockInvalidate).toHaveBeenCalledWith('victim');
  });

  it('kurtarma kodu yenileme de sv artırır', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ twoFactorSecret: 'SECRET', twoFactorEnabled: true });
    prismaMock.user.update.mockResolvedValue({ sessionVersion: 6 });
    const { POST } = await import('@/app/api/auth/2fa/route');
    const res = await POST(await requestWithSession('/api/auth/2fa', 'POST', { action: 'recovery-codes', code: '123456' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sessionVersion: { increment: 1 } } })
    );
    expect(await cookieSv(res as never)).toBe(6);
  });

  it('yanlış kodda sv DEĞİŞMEZ ve çerez yenilenmez', async () => {
    const totp = jest.requireMock('@/lib/totp') as { verifyTOTP: jest.Mock };
    totp.verifyTOTP.mockReturnValueOnce(false);
    prismaMock.user.findUnique.mockResolvedValue({ twoFactorSecret: 'SECRET', twoFactorEnabled: true });
    const { POST } = await import('@/app/api/auth/2fa/route');
    const res = await POST(await requestWithSession('/api/auth/2fa', 'POST', { action: 'disable', code: '000000' }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(await cookieSv(res as never)).toBeNull();
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/user/password', () => {
  it('şifre değişimi sv artırır (çalınmış oturum düşer); bu tarayıcı yeni sv ile devam eder', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'victim', password: '$2a$12$old' });
    prismaMock.user.update.mockResolvedValue({ sessionVersion: 5 });
    prismaMock.auditLog.create.mockResolvedValue({});
    const { PATCH } = await import('@/app/api/user/password/route');
    const res = await PATCH(
      await requestWithSession('/api/user/password', 'PATCH', { currentPassword: 'Eski1234', newPassword: 'Yeni12345' })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { password: '$2a$12$new', sessionVersion: { increment: 1 } } })
    );
    expect(await cookieSv(res as never)).toBe(5);
    expect(mockInvalidate).toHaveBeenCalledWith('victim');
  });
});

describe('POST /api/auth/reset-password', () => {
  it('sıfırlama başarılıysa oturum önbelleği ANINDA bayatlatılır (çalınan oturum 60 sn yaşamaz)', async () => {
    mockConsumeReset.mockResolvedValue({ ok: true, userId: 'victim' });
    const { POST } = await import('@/app/api/auth/reset-password/route');
    const res = await POST(
      new NextRequest('https://app.qratex.com/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 't'.repeat(32), newPassword: 'Yeni12345' }),
      })
    );
    expect(res.status).toBe(200);
    expect(mockInvalidate).toHaveBeenCalledWith('victim');
  });

  it('geçersiz bağlantıda önbelleğe dokunulmaz', async () => {
    mockConsumeReset.mockResolvedValue({ ok: false, error: 'INVALID' });
    const { POST } = await import('@/app/api/auth/reset-password/route');
    const res = await POST(
      new NextRequest('https://app.qratex.com/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 't'.repeat(32), newPassword: 'Yeni12345' }),
      })
    );
    expect(res.status).toBe(400);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});
