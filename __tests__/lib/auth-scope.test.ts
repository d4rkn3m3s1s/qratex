/**
 * Rol × kapsam matrisi (P0-05): deny-by-default bayi/AI kapsamı ve senkron where yardımcıları.
 */
const mockStaffFindFirst = jest.fn();
const mockUserFindUnique = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    dealerStaff: { findFirst: (...args: unknown[]) => mockStaffFindFirst(...args) },
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
  },
  isPrismaConnectivityError: () => false,
}));

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
jest.mock('@/lib/redis', () => ({
  redisGetJson: (...args: unknown[]) => mockRedisGet(...args),
  redisSetJson: (...args: unknown[]) => mockRedisSet(...args),
}));

import {
  IMPOSSIBLE_SCOPE_ID,
  dealerScopeWhere,
  getActiveStaffDealerId,
  invalidateStaffScope,
  resolveAiScope,
  resolveDealerScope,
  scopeErrorResponse,
  userScopeWhere,
} from '@/lib/auth/scope';

type S = Parameters<typeof resolveDealerScope>[0];
const s = (id: string, role: string, extra: Record<string, unknown> = {}): S =>
  ({ user: { id, role, email: `${id}@t.com`, ...extra }, expires: '2099-01-01' }) as unknown as S;

const ADMIN = s('admin-1', 'ADMIN');
const DEALER_A = s('dealer-a', 'DEALER');
const STAFF_A = s('staff-1', 'STAFF', { dealerId: 'dealer-a' });
const CUSTOMER = s('cust-1', 'CUSTOMER');
const WEIRD = s('x-1', 'SUPERUSER');

beforeEach(() => {
  mockStaffFindFirst.mockReset();
  mockUserFindUnique.mockReset();
  mockRedisGet.mockReset().mockResolvedValue(null);
  mockRedisSet.mockReset().mockResolvedValue(undefined);
});

describe('resolveDealerScope — rol matrisi', () => {
  it('oturumsuz → 401', async () => {
    const r = await resolveDealerScope(null);
    expect(r).toMatchObject({ ok: false, status: 401, code: 'UNAUTHENTICATED' });
    const r2 = await resolveDealerScope({ user: {} } as unknown as S);
    expect(r2.ok).toBe(false);
  });

  it('DEALER → kendi id; başka bayi istenirse 403', async () => {
    expect(await resolveDealerScope(DEALER_A)).toMatchObject({ ok: true, dealerId: 'dealer-a', via: 'self' });
    expect(await resolveDealerScope(DEALER_A, { dealerId: 'dealer-a' })).toMatchObject({ ok: true });
    expect(await resolveDealerScope(DEALER_A, { dealerId: 'dealer-b' })).toMatchObject({ ok: false, status: 403 });
  });

  it('STAFF → DB’deki AKTİF bağ; JWT dealerId’sine güvenilmez', async () => {
    mockStaffFindFirst.mockResolvedValue({ dealerId: 'dealer-a' });
    const r = await resolveDealerScope(STAFF_A);
    expect(r).toMatchObject({ ok: true, dealerId: 'dealer-a', actorRole: 'STAFF', via: 'staff' });
    expect(mockStaffFindFirst).toHaveBeenCalledWith({
      where: { userId: 'staff-1', isActive: true },
      select: { dealerId: true },
    });
    // Olumlu sonuç önbelleğe yazılır.
    expect(mockRedisSet).toHaveBeenCalledWith('scope:staff:staff-1', { dealerId: 'dealer-a' }, 30);
  });

  it('pasif/çıkarılmış STAFF → 403 STAFF_INACTIVE (JWT hâlâ dealerId taşısa da)', async () => {
    mockStaffFindFirst.mockResolvedValue(null);
    const r = await resolveDealerScope(STAFF_A);
    expect(r).toMatchObject({ ok: false, status: 403, code: 'STAFF_INACTIVE' });
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it('STAFF başka bayiyi isteyemez', async () => {
    mockStaffFindFirst.mockResolvedValue({ dealerId: 'dealer-a' });
    expect(await resolveDealerScope(STAFF_A, { dealerId: 'dealer-b' })).toMatchObject({ ok: false, status: 403 });
  });

  it('STAFF sıcak katmandan okunur (DB’ye gitmez)', async () => {
    mockRedisGet.mockResolvedValue({ dealerId: 'dealer-a' });
    expect(await getActiveStaffDealerId('staff-1')).toBe('dealer-a');
    expect(mockStaffFindFirst).not.toHaveBeenCalled();
  });

  it('geçersiz kılınmış önbellek işareti DB’ye düşürür', async () => {
    mockRedisGet.mockResolvedValue({ dealerId: null });
    mockStaffFindFirst.mockResolvedValue(null);
    expect(await getActiveStaffDealerId('staff-1')).toBeNull();
    expect(mockStaffFindFirst).toHaveBeenCalled();
    await invalidateStaffScope('staff-1');
    expect(mockRedisSet).toHaveBeenCalledWith('scope:staff:staff-1', { dealerId: null }, 30);
  });

  it('ADMIN açık dealerId olmadan → 400 DEALER_ID_REQUIRED', async () => {
    expect(await resolveDealerScope(ADMIN)).toMatchObject({ ok: false, status: 400, code: 'DEALER_ID_REQUIRED' });
  });

  it('ADMIN + gerçek DEALER hedefi → kapsam; hedef DEALER değilse 404', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ role: 'DEALER' });
    expect(await resolveDealerScope(ADMIN, { dealerId: 'dealer-b' })).toMatchObject({
      ok: true,
      dealerId: 'dealer-b',
      via: 'admin',
    });
    mockUserFindUnique.mockResolvedValueOnce({ role: 'CUSTOMER' });
    expect(await resolveDealerScope(ADMIN, { dealerId: 'cust-1' })).toMatchObject({ ok: false, status: 404 });
    mockUserFindUnique.mockResolvedValueOnce(null);
    expect(await resolveDealerScope(ADMIN, { dealerId: 'nope' })).toMatchObject({ ok: false, status: 404 });
  });

  it('ADMIN hedef doğrulaması kapatılabilir; bozuk kimlik 400', async () => {
    expect(await resolveDealerScope(ADMIN, { dealerId: 'dealer-z', verifyAdminTarget: false })).toMatchObject({
      ok: true,
      dealerId: 'dealer-z',
    });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(await resolveDealerScope(ADMIN, { dealerId: "x' OR 1=1" })).toMatchObject({ ok: false, status: 400 });
  });

  it('CUSTOMER ve bilinmeyen rol → 403', async () => {
    expect(await resolveDealerScope(CUSTOMER)).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' });
    expect(await resolveDealerScope(WEIRD)).toMatchObject({ ok: false, status: 403 });
  });

  it('allowRoles daraltması: yazma ucunda STAFF/ADMIN reddedilir', async () => {
    mockStaffFindFirst.mockResolvedValue({ dealerId: 'dealer-a' });
    expect(await resolveDealerScope(STAFF_A, { allowRoles: ['DEALER'] })).toMatchObject({ ok: false, status: 403 });
    expect(await resolveDealerScope(ADMIN, { allowRoles: ['DEALER'], dealerId: 'dealer-a' })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(mockStaffFindFirst).not.toHaveBeenCalled();
  });
});

describe('resolveAiScope', () => {
  it('DEALER/STAFF bayi kapsamı alır', async () => {
    expect(await resolveAiScope(DEALER_A)).toMatchObject({ ok: true, kind: 'dealer', dealerId: 'dealer-a' });
    mockStaffFindFirst.mockResolvedValue({ dealerId: 'dealer-a' });
    expect(await resolveAiScope(STAFF_A)).toMatchObject({ ok: true, kind: 'dealer', dealerId: 'dealer-a' });
  });

  it('ADMIN platform kapsamı yalnız açıkça istenirse', async () => {
    expect(await resolveAiScope(ADMIN)).toMatchObject({ ok: false, status: 400 });
    expect(await resolveAiScope(ADMIN, { allowPlatform: true })).toMatchObject({
      ok: true,
      kind: 'platform',
      dealerId: null,
    });
    mockUserFindUnique.mockResolvedValueOnce({ role: 'DEALER' });
    expect(await resolveAiScope(ADMIN, { allowPlatform: true, dealerId: 'dealer-a' })).toMatchObject({
      ok: true,
      kind: 'dealer',
      dealerId: 'dealer-a',
    });
  });

  it('CUSTOMER/bilinmeyen AI kapsamı alamaz (platform bayrağıyla bile)', async () => {
    expect(await resolveAiScope(CUSTOMER, { allowPlatform: true })).toMatchObject({ ok: false, status: 403 });
    expect(await resolveAiScope(WEIRD, { allowPlatform: true })).toMatchObject({ ok: false, status: 403 });
    expect(await resolveAiScope(null, { allowPlatform: true })).toMatchObject({ ok: false, status: 401 });
  });
});

describe('dealerScopeWhere / userScopeWhere — bilinmeyen rolde imkânsız filtre', () => {
  it.each([
    ['ADMIN', ADMIN, {}, {}],
    ['DEALER', DEALER_A, { dealerId: 'dealer-a' }, { userId: IMPOSSIBLE_SCOPE_ID }],
    ['STAFF', STAFF_A, { dealerId: IMPOSSIBLE_SCOPE_ID }, { userId: IMPOSSIBLE_SCOPE_ID }],
    ['CUSTOMER', CUSTOMER, { dealerId: IMPOSSIBLE_SCOPE_ID }, { userId: 'cust-1' }],
    ['bilinmeyen', WEIRD, { dealerId: IMPOSSIBLE_SCOPE_ID }, { userId: IMPOSSIBLE_SCOPE_ID }],
    ['oturumsuz', null, { dealerId: IMPOSSIBLE_SCOPE_ID }, { userId: IMPOSSIBLE_SCOPE_ID }],
  ])('%s', (_label, session, dealerWhere, userWhere) => {
    expect(dealerScopeWhere(session as S)).toEqual(dealerWhere);
    expect(userScopeWhere(session as S)).toEqual(userWhere);
  });
});

describe('scopeErrorResponse', () => {
  it('eski istemcilerle uyumlu zarf', async () => {
    const res = scopeErrorResponse({ ok: false, status: 403, code: 'STAFF_INACTIVE', message: 'Pasif' });
    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(await res.json()).toEqual({ success: false, ok: false, error: 'Pasif', code: 'STAFF_INACTIVE', message: 'Pasif' });
  });
});
