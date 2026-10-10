/**
 * `/api/gamification/spin` — sunucu otoriter günlük çark.
 *
 *  - Kazanan sunucuda seçilir; puan YALNIZ `mintPoints` ile ve hak başına tek-kez anahtarıyla
 *    (`spin:<kullanıcı>:<İstanbul günü>:<sıra>`) basılır.
 *  - Günlük hak atomik koşullu artışla korunur; hak doluysa 409, kredi yok.
 *  - Çark kapalıysa 403 MODULE_DISABLED (eskiden kapalıyken "Yarın gel!" yazıyordu).
 *  - Kalan hak gerçek hesaplanır (eskiden sabit 0); ağırlıklar istemciye gitmez.
 *  - Yalnız CUSTOMER.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true, remaining: 100 }) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/idempotency', () => ({
  checkIdempotency: jest.fn().mockResolvedValue({ cached: false, key: '' }),
  storeIdempotency: jest.fn(),
}));
jest.mock('@/lib/gamification-ab', () => ({ getVariant: jest.fn().mockResolvedValue(null) }));

const tx = {
  dailySpin: { upsert: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
  notification: { create: jest.fn() },
  analyticsEvent: { create: jest.fn() },
};
const db = {
  dailySpin: { findUnique: jest.fn() },
  $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));

const PRIZES = [
  { id: 'p20', label: '20 Puan', type: 'points', value: 20, weight: 30 },
  { id: 'x50', label: '50 XP', type: 'xp', value: 50, weight: 30 },
  { id: 'none', label: 'Tekrar dene', type: 'nothing', value: 0, weight: 40 },
];
const mockMatrix = jest.fn();
const mockPick = jest.fn();
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: () => mockMatrix(),
  getSpinRules: (m: { spin: unknown }) => m.spin,
  pickSpinPrize: (...a: unknown[]) => mockPick(...a),
}));

import { GET, POST } from '@/app/api/gamification/spin/route';
import { istanbulDay } from '@/components/ds/page/date-range';

const customer = { session: { user: { id: 'cust-1', role: 'CUSTOMER' }, expires: '2099-01-01' } };

function post() {
  return POST(
    new NextRequest('http://localhost/api/gamification/spin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
    {}
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(customer);
  mockMatrix.mockResolvedValue({ spin: { enabled: true, dailyLimit: 2, prizes: PRIZES } });
  mockPick.mockReturnValue(PRIZES[0]);
  tx.dailySpin.updateMany.mockResolvedValue({ count: 1 });
  tx.dailySpin.findUnique.mockResolvedValue({ count: 1 });
  mockMint.mockResolvedValue({ credited: 20, xpCredited: 0, points: 520, level: 3, isLevelUp: false, duplicate: false });
});

describe('POST /api/gamification/spin', () => {
  it('puan ödülü mintPoints ile, İstanbul günü + sıra anahtarıyla basılır; kalan hak gerçek', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    const day = istanbulDay(new Date());

    expect(tx.dailySpin.updateMany).toHaveBeenCalledWith({
      where: { userId: 'cust-1', day: new Date(`${day}T00:00:00.000Z`), count: { lt: 2 } },
      data: { count: { increment: 1 } },
    });
    expect(mockMint).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 'cust-1', points: 20, xp: 0, source: 'spin', idempotencyKey: `spin:cust-1:${day}:1` })
    );
    expect(body.data).toMatchObject({
      prize: { id: 'p20', type: 'points', value: 20, index: 0 },
      credited: { points: 20, xp: 0 },
      balance: 520,
      remaining: 1,
    });
    // Ağırlık istemciye sızmaz.
    expect(JSON.stringify(body)).not.toContain('weight');
  });

  it('XP ödülü puan basmaz, yalnız XP', async () => {
    mockPick.mockReturnValue(PRIZES[1]);
    mockMint.mockResolvedValue({ credited: 0, xpCredited: 50, points: 500, level: 3, isLevelUp: true, duplicate: false });
    const body = await (await post()).json();
    expect(mockMint).toHaveBeenCalledWith(tx, expect.objectContaining({ points: 0, xp: 50 }));
    expect(body.data.credited).toEqual({ points: 0, xp: 50 });
    expect(body.data.isLevelUp).toBe(true);
  });

  it('"boş" sonuç kredi yapmaz ama hakkı tüketir', async () => {
    mockPick.mockReturnValue(PRIZES[2]);
    const body = await (await post()).json();
    expect(mockMint).not.toHaveBeenCalled();
    expect(body.data.credited).toEqual({ points: 0, xp: 0 });
    expect(tx.notification.create).toHaveBeenCalled();
  });

  it('günlük hak doluysa 409 ve kredi yok', async () => {
    tx.dailySpin.updateMany.mockResolvedValue({ count: 0 });
    const res = await post();
    expect(res.status).toBe(409);
    expect(mockMint).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('çark kapalıysa 403 MODULE_DISABLED, hak tüketilmez', async () => {
    mockMatrix.mockResolvedValue({ spin: { enabled: false, dailyLimit: 1, prizes: PRIZES } });
    const res = await post();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('müşteri olmayan rol 403', async () => {
    mockRequireAuth.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) });
    const res = await post();
    expect(res.status).toBe(403);
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('GET /api/gamification/spin', () => {
  it('durum: kalan hak DailySpin satırından, ödüller ağırlıksız', async () => {
    db.dailySpin.findUnique.mockResolvedValue({ count: 1 });
    const res = await GET(new NextRequest('http://localhost/api/gamification/spin'), {});
    const body = await res.json();
    expect(body.data).toMatchObject({ enabled: true, canSpin: true, dailyLimit: 2, remaining: 1 });
    expect(body.data.prizes[0]).toEqual({ id: 'p20', label: '20 Puan', type: 'points', value: 20 });
  });

  it('kapalıyken enabled=false (yanıltıcı "yarın gel" yok)', async () => {
    mockMatrix.mockResolvedValue({ spin: { enabled: false, dailyLimit: 1, prizes: PRIZES } });
    const body = await (await GET(new NextRequest('http://localhost/api/gamification/spin'), {})).json();
    expect(body.data).toMatchObject({ enabled: false, canSpin: false });
  });
});
