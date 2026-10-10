/**
 * Cüzdan ödül BFF uçları — varsayılan reddet sözleşmesi (rol, modül kapısı, zod, hata kodu).
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/idempotency', () => ({
  checkIdempotency: jest.fn(async () => ({ cached: false, key: '' })),
  storeIdempotency: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));
const blocked = jest.fn(async () => false);
jest.mock('@/lib/customer-wallet/gate', () => {
  const { ApiError } = jest.requireActual('@/lib/http/define-route');
  return {
    assertCustomerModule: async () => {
      if (await blocked()) throw new ApiError('MODULE_DISABLED');
    },
  };
});
const claimReward = jest.fn();
const openBox = jest.fn();
jest.mock('@/lib/wallet-rewards/mutations', () => ({
  claimReward: (...a: unknown[]) => claimReward(...a),
  openBox: (...a: unknown[]) => openBox(...a),
}));

import { WalletError } from '@/lib/wallet-rewards/errors';

function post(url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ session: { user: { id: 'u1', role: 'CUSTOMER' } } });
  blocked.mockResolvedValue(false);
});

describe('POST /api/customer/wallet/rewards/claim', () => {
  it('yalnız CUSTOMER rolü istenir; gövde şemasız → 400', async () => {
    const { POST } = await import('@/app/api/customer/wallet/rewards/claim/route');
    const res = await POST(post('/api/customer/wallet/rewards/claim', { nope: 1 }), {});
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
    expect(res.status).toBe(400);
    expect(claimReward).not.toHaveBeenCalled();
  });

  it('modül kapalıyken 403 MODULE_DISABLED, iş mantığı çalışmaz', async () => {
    blocked.mockResolvedValue(true);
    const { POST } = await import('@/app/api/customer/wallet/rewards/claim/route');
    const res = await POST(post('/api/customer/wallet/rewards/claim', { rewardId: 'r1' }), {});
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
    expect(claimReward).not.toHaveBeenCalled();
  });

  it('cüzdan hatası kodlu zarfa çevrilir (tükendi → 409 REWARD_SOLD_OUT); istek anahtarı servise iletilir', async () => {
    claimReward.mockRejectedValueOnce(new WalletError('REWARD_SOLD_OUT', 'Bu ödülün stoğu tükendi.'));
    const { POST } = await import('@/app/api/customer/wallet/rewards/claim/route');
    const res = await POST(post('/api/customer/wallet/rewards/claim', { rewardId: 'r1' }, { 'Idempotency-Key': 'abcdef0123456789' }), {});
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, code: 'REWARD_SOLD_OUT' });
    expect(claimReward).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', rewardId: 'r1', requestKey: 'abcdef0123456789' }));
  });
});

describe('POST /api/customer/wallet/boxes/[id]/open', () => {
  it('başarılı açılış zarfı + kullanıcı kapsamı', async () => {
    openBox.mockResolvedValueOnce({ boxId: 'b1', points: 120, alreadyOpened: false });
    const { POST } = await import('@/app/api/customer/wallet/boxes/[id]/open/route');
    const res = await POST(post('/api/customer/wallet/boxes/b1/open'), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ boxId: 'b1', points: 120 });
    expect(openBox).toHaveBeenCalledWith({ userId: 'u1', boxId: 'b1' });
  });

  it('oturum yoksa 401 (requireAuth reddi geçer)', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAuth.mockResolvedValueOnce({ error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    const { POST } = await import('@/app/api/customer/wallet/boxes/[id]/open/route');
    const res = await POST(post('/api/customer/wallet/boxes/b1/open'), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(401);
    expect(openBox).not.toHaveBeenCalled();
  });
});
