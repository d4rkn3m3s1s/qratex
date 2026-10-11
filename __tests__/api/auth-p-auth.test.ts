/**
 * p-auth (kimlik yüzeyi, Dalga 2) sunucu mantığı:
 *  - tek şifre politikası (kayıt = sıfırlama = OAuth sonrası şifre oluşturma)
 *  - kayıt ucu: kodlu yanıtlar (EMAIL_TAKEN 409, yarışta P2002 → 409, alanlı VALIDATION),
 *    dil tercihi hesaba yazılır, doğrulama token'ı hash'li AuthEmailToken
 *  - şifremi unuttum: doğrulanmamış hesap çıkmaza düşmez (doğrulama bağlantısı gider), yanıt aynı
 *  - OAuth sonrası şifre: politika + denetim kaydı + ALREADY_SET
 *  - sunucu verisi: davet önizlemesi yalnız geçerli kodda, QR bağlamı yalnız etkin kodda
 * Prisma ve yan servisler mock'lanır; DB'ye bağlanılmaz.
 */
import { NextRequest } from 'next/server';
import { evaluatePassword, passwordPolicyError } from '@/components/auth/p-auth/password-policy';

const afterQueue: Array<() => Promise<void>> = [];
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: (fn: () => Promise<void>) => afterQueue.push(fn) };
});

const prismaMock = {
  user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  account: { findFirst: jest.fn() },
  notification: { create: jest.fn() },
  analyticsEvent: { create: jest.fn() },
  auditLog: { create: jest.fn() },
  referralCode: { findUnique: jest.fn() },
  qRCode: { findFirst: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/rate-limit', () => ({
  getClientIdentifier: () => '10.0.0.9',
  checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true }),
  checkAuthEmailActionLimit: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock('@/lib/mail-sender', () => ({ isMailConfigured: () => true }));
jest.mock('@/lib/password', () => ({ hashPassword: jest.fn(async () => '$2a$12$hash') }));
const sendVerificationEmail = jest.fn().mockResolvedValue({ ok: true });
const sendPasswordResetEmail = jest.fn().mockResolvedValue({ ok: true });
jest.mock('@/lib/email', () => ({
  sendVerificationEmail: (...a: unknown[]) => sendVerificationEmail(...a),
  sendPasswordResetEmail: (...a: unknown[]) => sendPasswordResetEmail(...a),
}));
const tokenFns = {
  issueEmailVerificationToken: jest.fn().mockResolvedValue('d'.repeat(64)),
  revokeEmailVerificationTokens: jest.fn().mockResolvedValue(undefined),
  createAuthEmailToken: jest.fn().mockResolvedValue('e'.repeat(64)),
};
jest.mock('@/lib/auth-email-token', () => ({
  AUTH_TOKEN_PURPOSE: { PASSWORD_RESET: 'password_reset' },
  buildEmailVerifyUrl: (o: string, p: string) => `${o}/auth/verify-email?token=${p}`,
  issueEmailVerificationToken: (...a: unknown[]) => tokenFns.issueEmailVerificationToken(...a),
  revokeEmailVerificationTokens: (...a: unknown[]) => tokenFns.revokeEmailVerificationTokens(...a),
  createAuthEmailToken: (...a: unknown[]) => tokenFns.createAuthEmailToken(...a),
}));
const createPendingReferral = jest.fn();
const isReferralModuleEnabled = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/referral', () => ({
  createPendingReferral: (...a: unknown[]) => createPendingReferral(...a),
  normalizeReferralCode: (c: unknown) => (typeof c === 'string' && /^[A-Z0-9_-]{4,32}$/i.test(c.trim()) ? c.trim().toUpperCase() : null),
  isReferralModuleEnabled: () => isReferralModuleEnabled(),
}));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({ referral: { referredPoints: 500, referrerPoints: 1000 } })),
  getReferralRewards: (m: { referral: { referredPoints: number; referrerPoints: number } }) => m.referral,
}));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/auth/session-state', () => ({ invalidateSessionState: jest.fn(async () => undefined) }));
const getServerSession = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
// set-password artık requireAuth (oturum durumu + replay) kullanıyor; oturum getServerSession sahtesinden.
jest.mock('@/lib/api-auth', () => ({
  ANY_SIGNED_IN_ROLE: ['ADMIN', 'DEALER', 'STAFF', 'CUSTOMER'],
  requireAuth: async () => {
    const s = (await getServerSession()) as { user?: { id?: string } } | null;
    return s?.user?.id
      ? { session: s }
      : { error: new Response(JSON.stringify({ success: false, code: 'UNAUTHENTICATED' }), { status: 401 }) };
  },
}));
jest.mock('@/lib/site-setting-bool', () => ({ getBooleanSiteSetting: jest.fn(async () => true) }));
jest.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'app.qratex.com', 'x-forwarded-proto': 'https' }) }));

function post(path: string, body: unknown) {
  return new NextRequest(new URL(`https://app.qratex.com${path}`), {
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
  prismaMock.notification.create.mockResolvedValue({});
  prismaMock.analyticsEvent.create.mockResolvedValue({});
  prismaMock.auditLog.create.mockResolvedValue({});
  isReferralModuleEnabled.mockResolvedValue(true);
});

describe('şifre politikası (tek kaynak)', () => {
  it('kayıt kuralıyla aynı: 8+ karakter, küçük, büyük, rakam', () => {
    expect(evaluatePassword('Abcdef12').meetsPolicy).toBe(true);
    expect(evaluatePassword('abcdef12').meetsPolicy).toBe(false);
    expect(evaluatePassword('ABCDEF12').meetsPolicy).toBe(false);
    expect(evaluatePassword('Abcdefgh').meetsPolicy).toBe(false);
    expect(evaluatePassword('Ab1').meetsPolicy).toBe(false);
    expect(evaluatePassword('').strength).toBe(0);
  });

  it('Türkçe harf kuralı tek başına karşılamaz (sunucu regex ASCII ister)', () => {
    const ev = evaluatePassword('çğışöü12Ş');
    expect(ev.checks.lower).toBe(true);
    expect(ev.meetsPolicy).toBe(false);
  });

  it('güç: tahmin edilebilir kalıp "orta", uzun/simgeli "güçlü"', () => {
    expect(evaluatePassword('Password1').strength).toBe(2);
    expect(evaluatePassword('Abcd1234').strength).toBe(2); // ardışık dizi
    expect(evaluatePassword('Kedi7Mavi').strength).toBe(3);
    expect(evaluatePassword('Kedi7Mavi!Ay').strength).toBe(4);
  });

  it('sunucu kısa yolu kod döndürür; 128 üstü ayrı kod', () => {
    expect(passwordPolicyError('Abcdef12')).toBeNull();
    expect(passwordPolicyError('abc')).toBe('WEAK_PASSWORD');
    expect(passwordPolicyError(42)).toBe('WEAK_PASSWORD');
    expect(passwordPolicyError(`Ab1${'x'.repeat(130)}`)).toBe('PASSWORD_TOO_LONG');
  });
});

describe('POST /api/auth/register', () => {
  const valid = { name: 'Ayşe Kaya', email: 'Ayse@Ornek.com', password: 'Kedi7Mavi', confirmPassword: 'Kedi7Mavi', role: 'CUSTOMER' };

  it('başarı: doğrulama ister, dil tercihi yazılır, token hash\'li uçtan üretilir, bildirim info + dilinde', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u1', name: 'Ayşe Kaya', email: 'ayse@ornek.com', role: 'CUSTOMER', createdAt: new Date() });
    const { POST } = await import('@/app/api/auth/register/route');
    const res = await POST(post('/api/auth/register', { ...valid, locale: 'en' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ success: true, requiresVerification: true, emailSent: true }));
    expect(body.verifyUrl).toBeUndefined(); // gönderildi → token yanıtta yok
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'ayse@ornek.com', preferredLanguage: 'en', emailVerified: null }) })
    );
    expect(tokenFns.issueEmailVerificationToken).toHaveBeenCalledWith('u1');
    expect(sendVerificationEmail.mock.calls[0][1]).toContain('/auth/verify-email?token=');
    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', type: 'info', title: 'Verify your email' }),
    });
  });

  it('kayıtlı e-posta → 409 EMAIL_TAKEN (anahtar, sabit Türkçe cümle değil)', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'x' });
    const { POST } = await import('@/app/api/auth/register/route');
    const res = await POST(post('/api/auth/register', valid));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(expect.objectContaining({ code: 'EMAIL_TAKEN', error: 'auth.emailAlreadyRegistered' }));
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('varlık kontrolü ile oluşturma arasındaki yarış (P2002) 500 değil 409', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const { POST } = await import('@/app/api/auth/register/route');
    const res = await POST(post('/api/auth/register', valid));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('EMAIL_TAKEN');
  });

  it('geçersiz alan → 400 VALIDATION + alan adı + i18n anahtarı', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const res = await POST(post('/api/auth/register', { ...valid, password: 'zayif', confirmPassword: 'zayif' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION');
    expect(body.field).toBe('password');
    expect(String(body.error)).toMatch(/^validation\.register\./);
  });

  it('doğrulama token\'ı üretilemezse hesap geri alınmaz; emailSent=false dürüstçe döner', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u2', name: 'A', email: 'a@b.co', role: 'CUSTOMER', createdAt: new Date() });
    tokenFns.issueEmailVerificationToken.mockRejectedValueOnce(new Error('db'));
    const { POST } = await import('@/app/api/auth/register/route');
    const res = await POST(post('/api/auth/register', valid));
    expect(res.status).toBe(200);
    expect((await res.json()).emailSent).toBe(false);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/forgot-password — doğrulanmamış hesap', () => {
  it('sıfırlama yerine yeni doğrulama bağlantısı gider; yanıt doğrulanmış hesapla aynı', async () => {
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: 'u1', email: 'ali@x.com', name: 'Ali', emailVerified: null, suspendedAt: null, anonymizedAt: null,
    });
    const r1 = await POST(post('/api/auth/forgot-password', { email: 'ali@x.com' }));
    const b1 = await r1.json();
    await drainAfter();
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: 'u2', email: 'veli@x.com', name: 'Veli', emailVerified: new Date(), suspendedAt: null, anonymizedAt: null,
    });
    const r2 = await POST(post('/api/auth/forgot-password', { email: 'veli@x.com' }));
    const b2 = await r2.json();
    await drainAfter();

    expect(b1).toEqual(b2);
    expect(b1.code).toBe('SENT');
    expect(tokenFns.revokeEmailVerificationTokens).toHaveBeenCalledWith('u1', 'ali@x.com');
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail.mock.calls[0][0]).toBe('ali@x.com');
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail.mock.calls[0][0]).toBe('veli@x.com');
  });

  it('askıdaki hesaba hiçbir şey gönderilmez', async () => {
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: 'u3', email: 'z@x.com', name: null, emailVerified: null, suspendedAt: new Date(), anonymizedAt: null,
    });
    await POST(post('/api/auth/forgot-password', { email: 'z@x.com' }));
    await drainAfter();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/set-password (OAuth sonrası şifre)', () => {
  it('oturumsuz → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/auth/set-password/route');
    const res = await POST(post('/api/auth/set-password', { password: 'Kedi7Mavi' }));
    expect(res.status).toBe(401);
  });

  it('zayıf şifre → 400 WEAK_PASSWORD (kayıtla aynı politika); yazım yok', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1' } });
    const { POST } = await import('@/app/api/auth/set-password/route');
    const res = await POST(post('/api/auth/set-password', { password: 'sadeceuzun' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('WEAK_PASSWORD');
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('başarı: atomik yazım + denetim kaydı; Google bağlıysa e-posta doğrulanır', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1' } });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.account.findFirst.mockResolvedValue({ id: 'acc' });
    const { POST } = await import('@/app/api/auth/set-password/route');
    const res = await POST(post('/api/auth/set-password', { password: 'Kedi7Mavi' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.updateMany).toHaveBeenNthCalledWith(1, { where: { id: 'u1', password: null }, data: { password: '$2a$12$hash' } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', action: 'SET_INITIAL_PASSWORD', entityId: 'u1' }),
    });
  });

  it('şifresi olan hesap → 409 ALREADY_SET; denetim kaydı yazılmaz', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1' } });
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });
    const { POST } = await import('@/app/api/auth/set-password/route');
    const res = await POST(post('/api/auth/set-password', { password: 'Kedi7Mavi' }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_SET');
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/reset-password — politika', () => {
  it('kayıt politikasını karşılamayan yeni şifre token kontrolünden ÖNCE 400 WEAK_PASSWORD', async () => {
    const { POST } = await import('@/app/api/auth/reset-password/route');
    const res = await POST(post('/api/auth/reset-password', { token: 'a'.repeat(64), newPassword: 'kucukharf123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('WEAK_PASSWORD');
  });
});

describe('kimlik sayfası sunucu verisi', () => {
  it('davet önizlemesi: geçerli kodda yalnız ad + sunucu matrisinden puan', async () => {
    const { getReferralPreview } = await import('@/components/auth/p-auth/server-data');
    prismaMock.referralCode.findUnique.mockResolvedValue({
      isActive: true, usageCount: 2, maxUsage: 10, user: { name: 'Ayşe Nur Kaya', suspendedAt: null, anonymizedAt: null },
    });
    await expect(getReferralPreview('abcd1234')).resolves.toEqual({ inviterFirstName: 'Ayşe', referredPoints: 500 });
    expect(prismaMock.referralCode.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'ABCD1234' } }));
  });

  it('davet önizlemesi: pasif / kotası dolmuş / askıdaki sahip / kapalı modül / biçimsiz kod → null (vaat yok)', async () => {
    const { getReferralPreview } = await import('@/components/auth/p-auth/server-data');
    const owner = { name: 'Ali', suspendedAt: null, anonymizedAt: null };
    prismaMock.referralCode.findUnique.mockResolvedValueOnce({ isActive: false, usageCount: 0, maxUsage: null, user: owner });
    await expect(getReferralPreview('ABCD1234')).resolves.toBeNull();
    prismaMock.referralCode.findUnique.mockResolvedValueOnce({ isActive: true, usageCount: 5, maxUsage: 5, user: owner });
    await expect(getReferralPreview('ABCD1234')).resolves.toBeNull();
    prismaMock.referralCode.findUnique.mockResolvedValueOnce({
      isActive: true, usageCount: 0, maxUsage: null, user: { ...owner, suspendedAt: new Date() },
    });
    await expect(getReferralPreview('ABCD1234')).resolves.toBeNull();
    isReferralModuleEnabled.mockResolvedValueOnce(false);
    await expect(getReferralPreview('ABCD1234')).resolves.toBeNull();
    await expect(getReferralPreview('<script>')).resolves.toBeNull();
    await expect(getReferralPreview(null)).resolves.toBeNull();
  });

  it('davet önizlemesi DB hatasında null (sayfa çökmez)', async () => {
    const { getReferralPreview } = await import('@/components/auth/p-auth/server-data');
    prismaMock.referralCode.findUnique.mockRejectedValueOnce(new Error('db down'));
    await expect(getReferralPreview('ABCD1234')).resolves.toBeNull();
  });

  it('QR bağlamı: yalnız güvenli /feedback/<kod> yolunda, etkin kodda işletme adı', async () => {
    const { getQrContext } = await import('@/components/auth/p-auth/server-data');
    const origin = 'https://app.qratex.com';
    prismaMock.qRCode.findFirst.mockResolvedValueOnce({ expiresAt: null, dealer: { businessName: 'Kahve Durağı', name: 'Mehmet' } });
    await expect(getQrContext('/feedback/ABC123', origin)).resolves.toEqual({ placeName: 'Kahve Durağı' });
    expect(prismaMock.qRCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'ABC123', isActive: true, revokedAt: null, archivedAt: null } })
    );

    await expect(getQrContext('/customer', origin)).resolves.toBeNull();
    await expect(getQrContext('//evil.com/feedback/ABC123', origin)).resolves.toBeNull();
    await expect(getQrContext('https://evil.com/feedback/ABC123', origin)).resolves.toBeNull();
    prismaMock.qRCode.findFirst.mockResolvedValueOnce({ expiresAt: new Date(Date.now() - 1000), dealer: { businessName: 'X', name: null } });
    await expect(getQrContext(`${origin}/feedback/ABC123`, origin)).resolves.toBeNull();
    prismaMock.qRCode.findFirst.mockResolvedValueOnce(null);
    await expect(getQrContext('/feedback/YOK999', origin)).resolves.toBeNull();
  });

  it('oturum devam hedefi ham callback\'i değil güvenli yolu kullanır', async () => {
    const { continueTargetFor } = await import('@/components/auth/p-auth/server-data');
    const origin = 'https://app.qratex.com';
    expect(continueTargetFor({ email: 'a@b.co', role: 'CUSTOMER' }, 'javascript:alert(1)', origin)).toBe('/customer');
    expect(continueTargetFor({ email: 'a@b.co', role: 'CUSTOMER' }, '/admin', origin)).toBe('/customer');
    expect(continueTargetFor({ email: 'a@b.co', role: 'STAFF' }, null, origin)).toBe('/staff');
    expect(continueTargetFor({ email: 'a@b.co', role: 'CUSTOMER' }, '/customer/wallet', origin)).toBe('/customer/wallet');
  });

  it('özellik bayrakları: bağlantıyla giriş yalnız e-posta yapılandırılmışsa açık', async () => {
    const { getAuthFeatures } = await import('@/components/auth/p-auth/server-data');
    const f = await getAuthFeatures();
    expect(f.mailConfigured).toBe(true);
    expect(f.magicLink).toBe(true);
  });
});
