/**
 * Zorunlu admin 2FA — API katmanı (`requireAuth`). Yalnız /api/admin/* (proxy'nin yazdığı
 * `x-qx-pathname`); kapı-muaf (adminGate:false) uçlar ve admin dışı yollar etkilenmez.
 * Karar lib/auth/admin-2fa (demo/break-glass/fail-open) — burada mock'lanır.
 */
const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({ __esModule: true, getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));

let forwardedPath: string | null = null;
jest.mock('next/headers', () => ({
  headers: jest.fn(async () => {
    const h = new Headers({ 'user-agent': 'jest' });
    if (forwardedPath) h.set('x-qx-pathname', forwardedPath);
    return h;
  }),
}));
jest.mock('@/lib/token-replay', () => ({ checkTokenReplay: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/auth/session-state', () => ({
  loadSessionState: jest.fn(async () => ({})),
  evaluateSessionState: jest.fn(() => ({ ok: true, role: 'ADMIN', dealerId: null, staffActive: null })),
}));
jest.mock('@/lib/admin-gate', () => ({ checkAdminElevation: jest.fn(async () => ({ ok: true })) }));
const mockNeeds = jest.fn();
jest.mock('@/lib/auth/admin-2fa', () => ({ adminNeeds2faSetup: (...a: unknown[]) => mockNeeds(...a) }));

import { requireAuth } from '@/lib/api-auth';

async function result(r: Awaited<ReturnType<typeof requireAuth>>) {
  if ('error' in r) return { status: r.error.status, code: (await r.error.json()).code };
  return { status: 200, code: null };
}

beforeEach(() => {
  mockGetServerSession.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN' }, jti: 'sid-1', sv: 0 });
  mockNeeds.mockReset();
  forwardedPath = null;
});

describe('requireAuth — zorunlu admin 2FA (/api/admin/*)', () => {
  it('2FA yok → 403 ADMIN_2FA_REQUIRED', async () => {
    forwardedPath = '/api/admin/users';
    mockNeeds.mockResolvedValue(true);
    expect(await result(await requireAuth(['ADMIN']))).toEqual({ status: 403, code: 'ADMIN_2FA_REQUIRED' });
    expect(mockNeeds).toHaveBeenCalledWith('a1', { sid: 'sid-1', pathname: '/api/admin/users' });
  });
  it('2FA var / muaf / break-glass / DB hatası (karar false) → geçer', async () => {
    forwardedPath = '/api/admin/users';
    mockNeeds.mockResolvedValue(false);
    expect((await result(await requireAuth(['ADMIN']))).status).toBe(200);
  });
  it('admin dışı yol (ör. /api/auth/2fa kurulum ucu) denetlenmez', async () => {
    forwardedPath = '/api/auth/2fa';
    mockNeeds.mockResolvedValue(true);
    expect((await result(await requireAuth(['ADMIN', 'DEALER', 'CUSTOMER', 'STAFF']))).status).toBe(200);
    expect(mockNeeds).not.toHaveBeenCalled();
  });
  it('kapı-muaf uç (adminGate:false — gate, ekip) denetlenmez', async () => {
    forwardedPath = '/api/admin/gate';
    mockNeeds.mockResolvedValue(true);
    expect((await result(await requireAuth(['ADMIN'], { adminGate: false }))).status).toBe(200);
    expect(mockNeeds).not.toHaveBeenCalled();
  });
  it('yol başlığı yoksa da denetlenir (fail-closed)', async () => {
    mockNeeds.mockResolvedValue(true);
    expect((await result(await requireAuth(['ADMIN']))).status).toBe(403);
  });
});
