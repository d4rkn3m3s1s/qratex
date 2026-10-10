/**
 * GET /api/customer/league — Oyna → Lig BFF'i: varsayılan reddet (oturum + CUSTOMER rolü),
 * modül/menü kapısı, zod sorgu doğrulaması, zarf v2. Hesap `buildLeagueBoard`'da (ayrı test).
 */
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));

const mockModule = jest.fn();
const mockMenu = jest.fn();
jest.mock('@/lib/module-gate', () => ({
  assertModuleEnabled: (...a: unknown[]) => mockModule(...a),
  assertMenuItemVisible: (...a: unknown[]) => mockMenu(...a),
}));

const mockBuild = jest.fn();
jest.mock('@/lib/league-board/server', () => {
  class LeagueViewerNotFoundError extends Error {}
  return { buildLeagueBoard: (...a: unknown[]) => mockBuild(...a), LeagueViewerNotFoundError };
});

import { GET } from '@/app/api/customer/league/route';

const CUSTOMER = { session: { user: { id: 'cust-1', role: 'CUSTOMER' } } };

function call(qs = '') {
  return GET(new NextRequest(`http://localhost/api/customer/league${qs}`), {});
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockModule.mockReset().mockResolvedValue(null);
  mockMenu.mockReset().mockResolvedValue(null);
  mockBuild.mockReset().mockResolvedValue({ rows: [], total: 0 });
});

describe('GET /api/customer/league', () => {
  it('oturumsuz → 401 (anonim kazıma yok)', async () => {
    mockRequireAuth.mockResolvedValue({ error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    const res = await call();
    expect(res.status).toBe(401);
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it('yalnız CUSTOMER rolü istenir', async () => {
    mockRequireAuth.mockResolvedValue(CUSTOMER);
    await call();
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
  });

  it('varsayılanlar: points · week · sayfa 1; izleyici oturumdan', async () => {
    mockRequireAuth.mockResolvedValue(CUSTOMER);
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, success: true, data: { total: 0 } });
    expect(mockBuild).toHaveBeenCalledWith({ viewerId: 'cust-1', category: 'points', period: 'week', page: 1 });
  });

  it('seçimler geçirilir; geçersiz değer 400 VALIDATION', async () => {
    mockRequireAuth.mockResolvedValue(CUSTOMER);
    await call('?category=referrals&period=season&page=3');
    expect(mockBuild).toHaveBeenCalledWith({ viewerId: 'cust-1', category: 'referrals', period: 'season', page: 3 });
    const bad = await call('?category=money&period=weekly');
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe('VALIDATION');
  });

  it('modül kapalı ya da menü gizli → 403 MODULE_DISABLED ("veri yok" gibi değil)', async () => {
    mockRequireAuth.mockResolvedValue(CUSTOMER);
    mockModule.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    const a = await call();
    expect(a.status).toBe(403);
    expect((await a.json()).code).toBe('MODULE_DISABLED');

    mockMenu.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    const b = await call();
    expect(b.status).toBe(403);
    expect((await b.json()).code).toBe('MODULE_DISABLED');
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it('hesap hatası görünür (500 + retryable), sıfırlı 200 dönmez', async () => {
    mockRequireAuth.mockResolvedValue(CUSTOMER);
    mockBuild.mockRejectedValue(new Error('boom'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ success: false, code: 'INTERNAL', retryable: true });
  });
});
