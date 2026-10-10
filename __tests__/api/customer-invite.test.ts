/**
 * `/api/customer/me/invite/*` ve eski `/api/referral` sarmalayıcısı.
 *  - yalnız CUSTOMER (requireAuth(['CUSTOMER'])),
 *  - modül kapısı MÜŞTERİ rolüyle (role: 'customer') → 403 MODULE_DISABLED (denetim #3),
 *  - kod uygulama reddi makine-okunur `code` ile (istemci kendi dilinde gösterir),
 *  - eski POST yanıt alanları (`success`, `status`, `pointsEarned`, `error`) korunur (`/auth/complete`).
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true, remaining: 9 })) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));

const mockGate = jest.fn();
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: (...a: unknown[]) => mockGate(...a) }));

const mockOverview = jest.fn();
const mockApply = jest.fn();
const mockClaim = jest.fn();
const mockNudge = jest.fn();
const mockEnsure = jest.fn();
jest.mock('@/lib/referral-invite', () => ({
  INVITE_PAGE_MAX: 30,
  INVITE_PAGE_SIZE: 10,
  getInviteOverview: (...a: unknown[]) => mockOverview(...a),
  listInviteRows: jest.fn(async () => ({ rows: [], nextCursor: null })),
  applyInviteCode: (...a: unknown[]) => mockApply(...a),
  claimReferralMilestones: (...a: unknown[]) => mockClaim(...a),
  nudgeInvite: (...a: unknown[]) => mockNudge(...a),
  ensureReferralCode: (...a: unknown[]) => mockEnsure(...a),
  inviteRejectStatus: (c: string) => (c === 'ALREADY_REFERRED' ? 409 : 400),
}));

import { GET as getOverview } from '@/app/api/customer/me/invite/route';
import { POST as postCode } from '@/app/api/customer/me/invite/code/route';
import { POST as postApply } from '@/app/api/customer/me/invite/apply/route';
import { POST as postClaim } from '@/app/api/customer/me/invite/milestones/claim/route';
import { POST as postNudge } from '@/app/api/customer/me/invite/referrals/[id]/nudge/route';
import { POST as legacyPost } from '@/app/api/referral/route';

const customer = { session: { user: { id: 'cust-1', role: 'CUSTOMER' }, expires: '2099-01-01' } };

function json(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(customer);
  mockGate.mockResolvedValue(null);
});

describe('GET /api/customer/me/invite', () => {
  it('yalnız CUSTOMER; modül kapısı müşteri rolüyle; okuma modeli zarf v2 içinde', async () => {
    mockOverview.mockResolvedValue({ code: 'ABCD2345' });
    const res = await getOverview(new NextRequest('http://localhost/api/customer/me/invite'), {});
    expect(res.status).toBe(200);
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
    expect(mockGate).toHaveBeenCalledWith('referrals', expect.objectContaining({ role: 'customer', userId: 'cust-1' }));
    const body = await res.json();
    expect(body).toMatchObject({ success: true, data: { code: 'ABCD2345' } });
    expect(mockOverview).toHaveBeenCalledWith('cust-1');
  });

  it('modül müşteriye kapalı → 403 MODULE_DISABLED, veri okunmaz', async () => {
    mockGate.mockResolvedValue(new Response(null, { status: 403 }));
    const res = await getOverview(new NextRequest('http://localhost/api/customer/me/invite'), {});
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
    expect(mockOverview).not.toHaveBeenCalled();
  });

  it('bayi erişemez (requireAuth 403)', async () => {
    mockRequireAuth.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) });
    const res = await getOverview(new NextRequest('http://localhost/api/customer/me/invite'), {});
    expect(res.status).toBe(403);
    expect(mockOverview).not.toHaveBeenCalled();
  });
});

describe('POST /api/customer/me/invite/code', () => {
  it('kodu POST ile hazırlar', async () => {
    mockEnsure.mockResolvedValue({ code: 'ABCD2345', isActive: true });
    const res = await postCode(json('http://localhost/api/customer/me/invite/code'), {});
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ code: 'ABCD2345', codeActive: true });
    expect(mockEnsure).toHaveBeenCalledWith('cust-1');
  });
});

describe('POST /api/customer/me/invite/apply', () => {
  it('ret → makine-okunur kod + doğru durum', async () => {
    mockApply.mockResolvedValue({ ok: false, code: 'WINDOW_EXPIRED', message: 'pencere' });
    const res = await postApply(json('http://localhost/api/customer/me/invite/apply', { code: 'abcd2345' }), {});
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, code: 'WINDOW_EXPIRED', error: 'pencere' });
  });

  it('başarı → PENDING (puan iddiası yok)', async () => {
    mockApply.mockResolvedValue({ ok: true, status: 'PENDING', pointsEarned: 0, expiresAt: '2026-11-09T00:00:00.000Z' });
    const res = await postApply(json('http://localhost/api/customer/me/invite/apply', { code: 'ABCD2345' }), {});
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ status: 'PENDING', pointsEarned: 0 });
    expect(mockApply).toHaveBeenCalledWith('cust-1', 'ABCD2345');
  });

  it('boş kod → 400 VALIDATION, servis çağrılmaz', async () => {
    const res = await postApply(json('http://localhost/api/customer/me/invite/apply', { code: '  ' }), {});
    expect(res.status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe('POST /api/customer/me/invite/milestones/claim', () => {
  it('talep edilecek kademe yoksa 409 NOTHING_TO_CLAIM', async () => {
    mockClaim.mockResolvedValue({ awarded: 0, points: 0, milestones: [] });
    const res = await postClaim(json('http://localhost/api/customer/me/invite/milestones/claim'), {});
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NOTHING_TO_CLAIM');
  });
});

describe('POST /api/customer/me/invite/referrals/:id/nudge', () => {
  it('kapsam: çağıran kullanıcı ile; bekleme süresinde 429 + nextAt', async () => {
    mockNudge.mockResolvedValue({ kind: 'rejected', reason: 'RECENTLY_NUDGED', nextAt: '2026-10-12T10:00:00.000Z' });
    const res = await postNudge(json('http://localhost/api/customer/me/invite/referrals/r1/nudge'), {
      params: Promise.resolve({ id: 'r1' }),
    });
    expect(mockNudge).toHaveBeenCalledWith('cust-1', 'r1');
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: 'RECENTLY_NUDGED', details: { nextAt: '2026-10-12T10:00:00.000Z' } });
  });
});

describe('POST /api/referral (eski, /auth/complete)', () => {
  it('yanıt alanları korunur: success + status + pointsEarned kökte', async () => {
    mockApply.mockResolvedValue({ ok: true, status: 'COMPLETED', pointsEarned: 500, expiresAt: '2026-11-09T00:00:00.000Z' });
    const res = await legacyPost(json('http://localhost/api/referral', { code: 'ABCD2345' }), {});
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, status: 'COMPLETED', pointsEarned: 500 });
  });

  it('ret → success:false + error metni (referral-outcome "failed" + neden)', async () => {
    mockApply.mockResolvedValue({ ok: false, code: 'ALREADY_REFERRED', message: 'Daha önce bir davet kodu kullandın.' });
    const res = await legacyPost(json('http://localhost/api/referral', { code: 'ABCD2345' }), {});
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ success: false, error: 'Daha önce bir davet kodu kullandın.', code: 'ALREADY_REFERRED' });
  });
});
