/**
 * Kimlik e-posta uçları — hesap sayımına karşı tek tip yanıt (P0-39 resend, P0-02 forgot),
 * resend'in yalnız doğrulanmamış hesaba gönderim yapması ve 2FA değişiminde oturum
 * çerezinin yeni `sv` ile yeniden imzalanması (P0-07). Prisma mock'lanır.
 */
import { NextRequest, NextResponse } from 'next/server';
import { encode, decode } from 'next-auth/jwt';

const afterQueue: Array<() => Promise<void>> = [];
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: (fn: () => Promise<void>) => afterQueue.push(fn) };
});

const prismaMock = {
  user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/rate-limit', () => ({
  getClientIdentifier: () => '10.0.0.9',
  checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true }),
  checkAuthEmailActionLimit: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock('@/lib/mail-sender', () => ({ isMailConfigured: () => true }));
const sendVerificationEmail = jest.fn().mockResolvedValue({ ok: true });
const sendPasswordResetEmail = jest.fn().mockResolvedValue({ ok: false, error: 'SMTP 550 iç ayrıntı' });
jest.mock('@/lib/email', () => ({
  sendVerificationEmail: (...a: unknown[]) => sendVerificationEmail(...a),
  sendPasswordResetEmail: (...a: unknown[]) => sendPasswordResetEmail(...a),
}));
const tokenFns = {
  issueEmailVerificationToken: jest.fn().mockResolvedValue('d'.repeat(64)),
  revokeEmailVerificationTokens: jest.fn().mockResolvedValue(undefined),
  findEmailVerifyTokenOwner: jest.fn(),
  createAuthEmailToken: jest.fn().mockResolvedValue('e'.repeat(64)),
};
jest.mock('@/lib/auth-email-token', () => ({
  AUTH_TOKEN_PURPOSE: { PASSWORD_RESET: 'password_reset' },
  buildEmailVerifyUrl: (o: string, p: string) => `${o}/auth/verify-email?token=${p}`,
  issueEmailVerificationToken: (...a: unknown[]) => tokenFns.issueEmailVerificationToken(...a),
  revokeEmailVerificationTokens: (...a: unknown[]) => tokenFns.revokeEmailVerificationTokens(...a),
  findEmailVerifyTokenOwner: (...a: unknown[]) => tokenFns.findEmailVerifyTokenOwner(...a),
  createAuthEmailToken: (...a: unknown[]) => tokenFns.createAuthEmailToken(...a),
}));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));

function post(path: string, body: unknown) {
  return new NextRequest(new URL(`http://localhost${path}`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function drainAfter() {
  while (afterQueue.length) await afterQueue.shift()!();
}

beforeEach(() => {
  jest.clearAllMocks();
  afterQueue.length = 0;
});

describe('POST /api/auth/verify-email/resend', () => {
  it('var olan doğrulanmamış hesap ile olmayan hesap AYNI yanıtı alır; yalnız ilkine gönderilir', async () => {
    const { POST } = await import('@/app/api/auth/verify-email/resend/route');

    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: 'u1', email: 'ali@x.com', name: 'Ali', emailVerified: null, suspendedAt: null, anonymizedAt: null,
    });
    const r1 = await POST(post('/api/auth/verify-email/resend', { email: ' Ali@X.com ' }));
    const b1 = await r1.json();
    await drainAfter();

    prismaMock.user.findFirst.mockResolvedValueOnce(null);
    const r2 = await POST(post('/api/auth/verify-email/resend', { email: 'yok@x.com' }));
    const b2 = await r2.json();
    await drainAfter();

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(b1).toEqual(b2);
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toEqual({ email: { equals: 'ali@x.com', mode: 'insensitive' } });
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail.mock.calls[0][0]).toBe('ali@x.com');
    expect(tokenFns.revokeEmailVerificationTokens).toHaveBeenCalledWith('u1', 'ali@x.com');
  });

  it('zaten doğrulanmış hesaba gönderim yapılmaz (yanıt yine aynı)', async () => {
    const { POST } = await import('@/app/api/auth/verify-email/resend/route');
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: 'u1', email: 'ali@x.com', name: null, emailVerified: new Date(), suspendedAt: null, anonymizedAt: null,
    });
    const res = await POST(post('/api/auth/verify-email/resend', { email: 'ali@x.com' }));
    await drainAfter();
    expect(res.status).toBe(200);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('gövdesiz istek 400', async () => {
    const { POST } = await import('@/app/api/auth/verify-email/resend/route');
    const res = await POST(post('/api/auth/verify-email/resend', {}));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('gönderim hatası bile 502/ham hata sızdırmaz; olmayan hesapla aynı yanıt', async () => {
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: 'u1', email: 'ali@x.com', name: 'Ali', emailVerified: new Date(), suspendedAt: null, anonymizedAt: null,
    });
    const r1 = await POST(post('/api/auth/forgot-password', { email: 'ALI@x.com', callbackUrl: '/\\evil.com' }));
    const b1 = await r1.json();
    await drainAfter();
    prismaMock.user.findFirst.mockResolvedValueOnce(null);
    const r2 = await POST(post('/api/auth/forgot-password', { email: 'yok@x.com' }));
    const b2 = await r2.json();
    await drainAfter();

    expect(r1.status).toBe(200);
    expect(b1).toEqual(b2);
    expect(JSON.stringify(b1)).not.toContain('SMTP');
    // Zararlı callbackUrl e-postadaki bağlantıya GÖMÜLMEZ.
    const resetUrl = String(sendPasswordResetEmail.mock.calls[0][1]);
    expect(resetUrl).not.toContain('callbackUrl');
  });
});

describe('reissueSessionCookie (2FA değişiminde oturum korunur, sv yenilenir)', () => {
  it('mevcut çerezi yeni sv ile yeniden imzalar', async () => {
    const { reissueSessionCookie } = await import('@/lib/auth/session-version');
    const secret = 'x'.repeat(40);
    const original = await encode({ token: { id: 'u1', role: 'CUSTOMER', sv: 2 }, secret });
    const req = new NextRequest(new URL('https://app.qratex.com/api/auth/2fa'), {
      headers: { cookie: `__Secure-next-auth.session-token=${original}` },
    });
    const res = NextResponse.json({ ok: true });
    const ok = await reissueSessionCookie(req, res, { sv: 3 }, { maxAge: 3600, secret });
    expect(ok).toBe(true);
    const cookie = res.cookies.get('__Secure-next-auth.session-token');
    expect(cookie?.value).toBeTruthy();
    const decoded = await decode({ token: cookie!.value, secret });
    expect(decoded).toMatchObject({ id: 'u1', role: 'CUSTOMER', sv: 3 });
  });

  it('çerez yoksa dokunmaz', async () => {
    const { reissueSessionCookie } = await import('@/lib/auth/session-version');
    const req = new NextRequest(new URL('https://app.qratex.com/api/auth/2fa'));
    const res = NextResponse.json({ ok: true });
    await expect(reissueSessionCookie(req, res, { sv: 1 }, { maxAge: 60, secret: 's'.repeat(40) })).resolves.toBe(false);
  });
});
