/**
 * An Motoru API'si — yalnız CUSTOMER, yalnız kendi kayıtları.
 *
 * Senaryolar:
 *  - GET yalnız oturumdaki kullanıcının `seenAt: null` anlarını, en eski önce, en fazla 10 döndürür;
 *    bozuk tür/payload satırları sızmaz.
 *  - POST /seen başka kullanıcının id'sini göndererek onun anını "görüldü" yapamaz
 *    (where userId = oturum); 20'den fazla id 400.
 *  - DEALER/ADMIN erişemez (requireAuth yalnız CUSTOMER ile çağrılır).
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockFindMany = jest.fn();
const mockUpdateMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    customerMoment: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
    },
  },
  isPrismaConnectivityError: () => false,
}));

const mockRateLimit = jest.fn();
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: (...args: unknown[]) => mockRateLimit(...args),
}));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));

import { GET } from '@/app/api/customer/moments/route';
import { POST } from '@/app/api/customer/moments/seen/route';

const customer = { session: { user: { id: 'cust-1', role: 'CUSTOMER' }, expires: '2099-01-01' } };

function postSeen(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/customer/moments/seen', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    {}
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(customer);
  mockRateLimit.mockResolvedValue({ ok: true, remaining: 10 });
});

describe('GET /api/customer/moments', () => {
  it('yalnız kendi görülmemiş anları, en eski önce, en fazla 10', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'm1', kind: 'level_up', payload: { from: 1, to: 2, xp: 10 }, createdAt: new Date('2026-10-01T00:00:00Z') },
      { id: 'm2', kind: 'hack', payload: {}, createdAt: new Date('2026-10-02T00:00:00Z') },
      { id: 'm3', kind: 'badge', payload: null, createdAt: new Date('2026-10-03T00:00:00Z') },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/customer/moments'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'cust-1', seenAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 10,
      })
    );
    expect(body.moments).toEqual([
      { id: 'm1', kind: 'level_up', payload: { from: 1, to: 2, xp: 10 }, createdAt: '2026-10-01T00:00:00.000Z' },
    ]);
    expect(body.data.moments).toHaveLength(1);
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
  });

  it('müşteri olmayan rol 403 alır, DB okunmaz', async () => {
    mockRequireAuth.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    });
    const res = await GET(new NextRequest('http://localhost/api/customer/moments'), {});
    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/customer/moments/seen', () => {
  it('yalnız oturumdaki kullanıcının, henüz görülmemiş kayıtları güncellenir (başka kullanıcının id\'si etkisiz)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const res = await postSeen({ ids: ['m1', 'other-users-moment', 'm1'] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(1);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1', 'other-users-moment'] }, userId: 'cust-1', seenAt: null },
      data: { seenAt: expect.any(Date) },
    });
  });

  it('20\'den fazla id → 400, DB yazılmaz', async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `m${i}`);
    const res = await postSeen({ ids });
    expect(res.status).toBe(400);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('boş liste → 400', async () => {
    const res = await postSeen({ ids: [] });
    expect(res.status).toBe(400);
  });

  it('rate limit dolunca 429', async () => {
    mockRateLimit.mockResolvedValue({ ok: false, retryAfterMs: 5000 });
    const res = await postSeen({ ids: ['m1'] });
    expect(res.status).toBe(429);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
