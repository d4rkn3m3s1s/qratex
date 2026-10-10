/**
 * Güvenlik: /api/dealer/analytics/impact — ağır yol (fresh=1 / özel aralık) ayrı ve sıkı hız
 * sınırına tabi; sayaç okunamazsa ağır yol reddedilir (fail-closed). Gerçek DB yok.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/api-auth', () => ({
  requireAuth: async () => ({ session: { user: { id: 'dealer-1', role: 'DEALER' } } }),
}));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/redis', () => ({ redisGetJson: async () => null, redisSetJson: async () => undefined }));
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: async () => null, assertMenuItemVisible: async () => null }));
jest.mock('@/lib/prisma', () => ({ prisma: {}, default: {}, isPrismaConnectivityError: () => false }));
const mockLimit = jest.fn();
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: (...a: unknown[]) => mockLimit(...a) }));
const mockLoad = jest.fn(async () => ({ ok: true }));
jest.mock('@/lib/dealer-impact/load', () => ({
  ImpactDealerNotFoundError: class extends Error {},
  loadDealerImpact: (...a: unknown[]) => mockLoad(...(a as [])),
}));

const get = (qs: string) => new NextRequest(`http://localhost/api/dealer/analytics/impact${qs}`);

beforeEach(() => {
  mockLimit.mockReset();
  mockLoad.mockClear();
});

describe('GET /api/dealer/analytics/impact', () => {
  it('ağır sorgu (fresh=1) ayrı kovaya sayılır; aşınca 429 ve yükleme yok', async () => {
    const { GET } = await import('@/app/api/dealer/analytics/impact/route');
    mockLimit.mockImplementation(async (key: string) => (key.startsWith('dealer-impact-heavy:') ? { ok: false, retryAfterMs: 30_000 } : { ok: true }));
    const res = await GET(get('?fresh=1'), {});
    expect(res.status).toBe(429);
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockLimit.mock.calls.some((c) => c[0] === 'dealer-impact-heavy:dealer-1' && c[1] === 6)).toBe(true);
  });

  it('özel aralık da ağır sayılır; sayaç hata verirse reddedilir (fail-closed)', async () => {
    const { GET } = await import('@/app/api/dealer/analytics/impact/route');
    mockLimit.mockImplementation(async (key: string) => {
      if (key.startsWith('dealer-impact-heavy:')) throw new Error('db down');
      return { ok: true };
    });
    const res = await GET(get('?from=2026-01-01&to=2026-06-01'), {});
    expect(res.status).toBe(429);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('önbellekli hazır dönem ağır kovaya girmez', async () => {
    const { GET } = await import('@/app/api/dealer/analytics/impact/route');
    mockLimit.mockResolvedValue({ ok: true });
    const res = await GET(get(''), {});
    expect(res.status).toBe(200);
    expect(mockLimit.mock.calls.some((c) => String(c[0]).startsWith('dealer-impact-heavy:'))).toBe(false);
  });
});
