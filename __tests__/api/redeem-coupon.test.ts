/**
 * /api/customer/redeem-coupon testleri: kullanıcı-başına tek-kullanım garantisi.
 * CouponRedemption (userId, couponId) UNIQUE → eşzamanlı ikinci istek transaction
 * içinde P2002 ile düşer ve 409 döner (eski AnalyticsEvent ön-kontrolü racy idi).
 * Ayrıca: pasif/süresi geçmiş kupon, global limit (CouponLimitReachedError → 400).
 */
import { NextRequest } from 'next/server';

// @prisma/client'ı kısmen mock'la: route'un instanceof kontrolü ile testin
// fırlattığı hata AYNI sınıfı görsün (generated client jest'te bu sınıfı export
// etmiyor → gerçek davranışı taklit eden minimal bir sınıf sağlıyoruz).
class FakePrismaKnownError extends Error {
  code: string;
  constructor(message: string, opts: { code: string }) {
    super(message);
    this.code = opts.code;
  }
}
jest.mock('@prisma/client', () => ({
  Prisma: { PrismaClientKnownRequestError: FakePrismaKnownError },
}));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  __esModule: true,
  getServerSession: (...a: unknown[]) => mockGetServerSession(...a),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true }),
}));

const mockCouponFindUnique = jest.fn();
const mockRedemptionFindUnique = jest.fn();
const mockTransaction = jest.fn();
const tx = {
  couponRedemption: { create: jest.fn() },
  coupon: { updateMany: jest.fn() },
  analyticsEvent: { create: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    coupon: { findUnique: (...a: unknown[]) => mockCouponFindUnique(...a) },
    couponRedemption: { findUnique: (...a: unknown[]) => mockRedemptionFindUnique(...a) },
    $transaction: (cb: (t: unknown) => unknown) => mockTransaction(cb),
  },
}));
jest.mock('@/lib/api-http', () => ({
  PRIVATE_NO_STORE_HEADERS: {},
  responseIfDatabaseUnavailable: () => null,
}));

const SESSION = { user: { id: 'u1', role: 'CUSTOMER' } };

async function redeem(code = 'SAVE10') {
  const { POST } = await import('@/app/api/customer/redeem-coupon/route');
  const req = new NextRequest('http://localhost/api/customer/redeem-coupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return POST(req);
}

function activeCoupon(over: Record<string, unknown> = {}) {
  return { id: 'c1', code: 'SAVE10', type: 'percentage', value: 10, minPurchase: null,
    maxUses: -1, usedCount: 0, isActive: true, expiresAt: null, ...over };
}

beforeEach(() => {
  mockGetServerSession.mockReset().mockResolvedValue(SESSION);
  mockCouponFindUnique.mockReset();
  mockRedemptionFindUnique.mockReset().mockResolvedValue(null);
  mockTransaction.mockReset().mockImplementation((cb) => cb(tx));
  tx.couponRedemption.create.mockReset().mockResolvedValue({});
  tx.coupon.updateMany.mockReset().mockResolvedValue({ count: 1 });
  tx.analyticsEvent.create.mockReset().mockResolvedValue({});
});

describe('redeem-coupon', () => {
  it('oturum yoksa 401', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await redeem();
    expect(res.status).toBe(401);
  });

  it('geçerli kupon ilk kez: 200, redemption + usedCount artar', async () => {
    mockCouponFindUnique.mockResolvedValue(activeCoupon());
    const res = await redeem();
    expect(res.status).toBe(200);
    expect(tx.couponRedemption.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'u1', couponId: 'c1' } })
    );
    expect(tx.coupon.updateMany).toHaveBeenCalled();
  });

  it('kupon yok/pasif → 404', async () => {
    mockCouponFindUnique.mockResolvedValue(null);
    expect((await redeem()).status).toBe(404);
    mockCouponFindUnique.mockResolvedValue(activeCoupon({ isActive: false }));
    expect((await redeem()).status).toBe(404);
  });

  it('süresi geçmiş kupon → 400', async () => {
    mockCouponFindUnique.mockResolvedValue(activeCoupon({ expiresAt: new Date(Date.now() - 1000) }));
    expect((await redeem()).status).toBe(400);
  });

  it('zaten kullanılmış (ön-kontrol) → 409', async () => {
    mockCouponFindUnique.mockResolvedValue(activeCoupon());
    mockRedemptionFindUnique.mockResolvedValue({ id: 'r1' });
    expect((await redeem()).status).toBe(409);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('YARIŞ: eşzamanlı ikinci istek transaction içinde P2002 → 409 (atomik garanti)', async () => {
    mockCouponFindUnique.mockResolvedValue(activeCoupon());
    // ön-kontrol null (yarış), ama create UNIQUE ihlali atar
    tx.couponRedemption.create.mockRejectedValue(
      new FakePrismaKnownError('Unique constraint failed', { code: 'P2002' })
    );
    const res = await redeem();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/zaten kullandınız/i);
  });

  it('global limit dolu (updateMany count=0) → 400', async () => {
    mockCouponFindUnique.mockResolvedValue(activeCoupon({ maxUses: 5, usedCount: 5 }));
    tx.coupon.updateMany.mockResolvedValue({ count: 0 });
    const res = await redeem();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limit/i);
  });
});
