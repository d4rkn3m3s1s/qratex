/**
 * Ben → İlerleme BFF uçları — varsayılan reddet:
 *  - yalnız CUSTOMER (requireAuth rol listesiyle çağrılır), kullanıcı kimliği oturumdan;
 *  - modül kapısı API'de (progress_hub / journey_score) → 403 MODULE_DISABLED;
 *  - zod sorgu doğrulaması (geçersiz dönem / süzgeç → 400);
 *  - zarf v2 + `Cache-Control: private, no-store`.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
const mockRateLimit = jest.fn();
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: (...a: unknown[]) => mockRateLimit(...a) }));
const mockGate = jest.fn();
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: (...a: unknown[]) => mockGate(...a) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));
const mockTrends = jest.fn();
jest.mock('@/components/customer/m-ben-ilerleme/server/trends', () => ({ getProgressTrends: (...a: unknown[]) => mockTrends(...a) }));
const mockJourney = jest.fn();
jest.mock('@/components/customer/m-ben-ilerleme/server/journey', () => ({ getJourneyPage: (...a: unknown[]) => mockJourney(...a) }));

import { GET as getTrends } from '@/app/api/customer/me/progress/trends/route';
import { GET as getJourney } from '@/app/api/customer/me/progress/journey/route';

const customer = { session: { user: { id: 'cust-1', role: 'CUSTOMER' }, expires: '2099-01-01' } };
const req = (url: string) => new NextRequest(`http://localhost${url}`);

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(customer);
  mockRateLimit.mockResolvedValue({ ok: true, remaining: 100 });
  mockGate.mockResolvedValue(null);
  mockTrends.mockResolvedValue({ period: 90, kpis: [] });
  mockJourney.mockResolvedValue({ items: [], nextCursor: null });
});

describe('GET /api/customer/me/progress/trends', () => {
  it('yalnız CUSTOMER, oturumdaki kullanıcı, progress_hub kapısı, zarf v2', async () => {
    const res = await getTrends(req('/api/customer/me/progress/trends?period=90&userId=baskasi'), {});
    expect(res.status).toBe(200);
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
    expect(mockGate).toHaveBeenCalledWith('progress_hub', expect.objectContaining({ userId: 'cust-1' }));
    expect(mockTrends).toHaveBeenCalledWith('cust-1', 90);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const body = await res.json();
    expect(body).toMatchObject({ success: true, data: { period: 90 } });
  });

  it('geçersiz dönem 400 VALIDATION', async () => {
    const res = await getTrends(req('/api/customer/me/progress/trends?period=45'), {});
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION');
    expect(mockTrends).not.toHaveBeenCalled();
  });

  it('modül kapalıysa 403 MODULE_DISABLED (veri okunmaz)', async () => {
    mockGate.mockResolvedValue(new Response('{}', { status: 403 }));
    const res = await getTrends(req('/api/customer/me/progress/trends'), {});
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
    expect(mockTrends).not.toHaveBeenCalled();
  });

  it('oturumsuz 401', async () => {
    mockRequireAuth.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) });
    const res = await getTrends(req('/api/customer/me/progress/trends'), {});
    expect(res.status).toBe(401);
    expect(mockTrends).not.toHaveBeenCalled();
  });

  it('hesap hatası 500 olur, sıfırlı 200 değil', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockTrends.mockRejectedValue(new Error('boom'));
    const res = await getTrends(req('/api/customer/me/progress/trends'), {});
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
});

describe('GET /api/customer/me/progress/journey', () => {
  it('journey_score kapısı, süzgeç ve imleç oturum kullanıcısına geçer', async () => {
    const res = await getJourney(req('/api/customer/me/progress/journey?filter=badges&cursor=abc'), {});
    expect(res.status).toBe(200);
    expect(mockGate).toHaveBeenCalledWith('journey_score', expect.anything());
    expect(mockJourney).toHaveBeenCalledWith('cust-1', { filter: 'badges', cursor: 'abc' });
  });

  it('bilinmeyen süzgeç 400', async () => {
    const res = await getJourney(req('/api/customer/me/progress/journey?filter=hepsi'), {});
    expect(res.status).toBe(400);
    expect(mockJourney).not.toHaveBeenCalled();
  });
});
