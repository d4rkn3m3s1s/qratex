/**
 * P0-19 — /api/admin/users PATCH add_points artık defter dışı puan basamaz.
 *
 * Saldırı/hata senaryoları (önceden):
 *   - `amount: 1e9` → sınırsız mint, `points_credited` yok, transaction yok.
 *   - `amount: -500` (100 puanlı kullanıcı) → bakiye -400.
 *   - `amount: 12.5` → Prisma Int hatası → 500.
 *   - PUT `{ points: 999999 }` → bakiyeyi doğrudan ezme.
 * Şimdi: hepsi tek yoldan (adjustPointsByAdmin) geçer ya da 4xx döner.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: { user: { id: 'admin1', role: 'ADMIN' } } })),
}));
jest.mock('@/lib/request-metadata', () => ({
  getAuditRequestMeta: () => ({ ipAddress: '1.1.1.1', userAgent: 'jest' }),
}));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));
jest.mock('@/lib/cursor-pagination', () => ({ parseCursor: jest.fn(), encodeCursor: jest.fn() }));
jest.mock('@/lib/validations-admin', () => ({ adminUsersQuerySchema: { safeParse: jest.fn() } }));
jest.mock('bcryptjs', () => ({ hash: jest.fn() }));

const mockNotificationCreate = jest.fn(async () => ({}));
const mockUserUpdate = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    notification: { create: (...a: unknown[]) => mockNotificationCreate(...(a as [])) },
    user: { update: (...a: unknown[]) => mockUserUpdate(...a), findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

const mockAdjust = jest.fn();
jest.mock('@/lib/economy', () => {
  const actual = jest.requireActual('@/lib/economy');
  return { ...actual, adjustPointsByAdmin: (...a: unknown[]) => mockAdjust(...a) };
});

import { EconomyError } from '@/lib/economy/errors';
import { InsufficientPointsError } from '@/lib/points-wallet';

async function patch(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const { PATCH } = await import('@/app/api/admin/users/route');
  const req = new NextRequest('http://localhost/api/admin/users', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const res = await PATCH(req);
  return { status: res.status, body: await res.json() };
}

const ok = {
  delta: 300,
  xpDelta: 0,
  pointsBefore: 100,
  points: 400,
  xp: 0,
  level: 1,
  isLevelUp: false,
  ledgerId: 'led1',
  duplicate: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAdjust.mockResolvedValue(ok);
});

describe('PATCH add_points → adjustPointsByAdmin', () => {
  it('ham increment yok: tek servis çağrılır, defter id ve önceki/sonraki bakiye döner', async () => {
    const r = await patch(
      { action: 'add_points', userId: 'u1', amount: 300, reason: 'Kampanya telafisi', requestId: 'req_12345678' },
      {}
    );
    expect(r.status).toBe(200);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, input] = mockAdjust.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input).toMatchObject({
      adminId: 'admin1',
      userId: 'u1',
      delta: 300,
      reason: 'Kampanya telafisi',
      idempotencyKey: 'admin-adjust:admin1:req_12345678',
    });
    expect(r.body.adjustment).toMatchObject({ pointsBefore: 100, points: 400, ledgerId: 'led1' });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
  });

  it('ondalık miktar 500 değil 400 döner ve servis çağrılmaz', async () => {
    const r = await patch({ action: 'add_points', userId: 'u1', amount: 12.5, reason: 'Gerekçe yazıldı' });
    expect(r.status).toBe(400);
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it('sınırsız miktar (1e9) reddedilir', async () => {
    const r = await patch({ action: 'add_points', userId: 'u1', amount: 1_000_000_000, reason: 'Gerekçe yazıldı' });
    expect(r.status).toBe(400);
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it('gerekçesiz düzeltme reddedilir', async () => {
    const r = await patch({ action: 'add_points', userId: 'u1', amount: 100 });
    expect(r.status).toBe(400);
    const r2 = await patch({ action: 'add_points', userId: 'u1', amount: 100, reason: 'abc' });
    expect(r2.status).toBe(400);
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it('eksi bakiyeye düşürme 409 INSUFFICIENT_POINTS (100 puanlı kullanıcıdan 500 düş)', async () => {
    mockAdjust.mockRejectedValueOnce(new InsufficientPointsError(100, 500));
    const r = await patch({ action: 'add_points', userId: 'u1', amount: -500, reason: 'Hatalı kredi geri alındı' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INSUFFICIENT_POINTS');
    expect(r.body.currentPoints).toBe(100);
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('eşik üstü ikinci onay yoksa 428 SECOND_APPROVAL_REQUIRED', async () => {
    mockAdjust.mockRejectedValueOnce(
      new EconomyError('SECOND_APPROVAL_REQUIRED', '10.000 puanın üzerindeki düzeltmeler ikinci bir yöneticinin onayını gerektirir.')
    );
    const r = await patch({ action: 'add_points', userId: 'u1', amount: 50_000, reason: 'Büyük telafi' });
    expect(r.status).toBe(428);
    expect(r.body.code).toBe('SECOND_APPROVAL_REQUIRED');
  });

  it('tekrar oynatılan istek (duplicate) ikinci bildirim üretmez', async () => {
    mockAdjust.mockResolvedValueOnce({ ...ok, duplicate: true });
    const r = await patch(
      { action: 'add_points', userId: 'u1', amount: 300, reason: 'Kampanya telafisi' },
      { 'idempotency-key': 'hdr_12345678' }
    );
    expect(r.status).toBe(200);
    expect((mockAdjust.mock.calls[0] as [unknown, { idempotencyKey: string }])[1].idempotencyKey).toBe(
      'admin-adjust:admin1:hdr_12345678'
    );
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });
});

describe('PUT bakiye ezme yasak', () => {
  it('points/xp/level gövdede varsa 400 USE_POINTS_ADJUSTMENT', async () => {
    const { PUT } = await import('@/app/api/admin/users/route');
    for (const body of [{ points: 999_999 }, { xp: 5 }, { level: 9 }]) {
      const req = new NextRequest('http://localhost/api/admin/users?id=u1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const res = await PUT(req);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('USE_POINTS_ADJUSTMENT');
    }
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
