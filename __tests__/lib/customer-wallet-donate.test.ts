/**
 * Cüzdan → Bağış sunucu mantığı (lib/customer-wallet/donate/**) + POST rotası.
 * Gerçek DB'ye gidilmez; puan düşümü `lib/economy` sahtesiyle doğrulanır.
 *
 * Kapsanan denetim bulguları (customer_donations.md):
 *  - B5: hedef / bitiş tarihi / aktiflik transaction içindeki koşullu güncellemeyle; aşırı fonlama yok.
 *  - B3: gerçek sıra + bir üst sıraya fark (ilk 10 dışında da).
 *  - B9: topluluk yanıtında başka kullanıcının kimliği yok (`isMe`), ad maskeli.
 *  - B12: `goal = 0` → %NaN yok; bozuk etki JSON'u uydurulmaz.
 *  - #53/#57: bağış `debitPoints(source:'donation', idempotencyKey)` ile; aynı anahtar ikinci kez düşmez.
 */
import { NextRequest } from 'next/server';

jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));

class MockInsufficient extends Error {
  currentPoints: number;
  requiredPoints: number;
  constructor(c: number, r: number) {
    super('Insufficient points');
    this.currentPoints = c;
    this.requiredPoints = r;
  }
}
const mockDebit = jest.fn();
jest.mock('@/lib/economy', () => ({
  debitPoints: (...a: unknown[]) => mockDebit(...a),
  InsufficientPointsError: MockInsufficient,
}));
const mockRedisGet = jest.fn(async () => null);
const mockRedisSet = jest.fn(async () => undefined);
jest.mock('@/lib/redis', () => ({
  redisGetJson: (...a: unknown[]) => mockRedisGet(...(a as [])),
  redisSetJson: (...a: unknown[]) => mockRedisSet(...(a as [])),
}));

// Rota testi için
const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));
const mockModuleGate = jest.fn(async () => null);
const mockMenuGate = jest.fn(async () => null);
jest.mock('@/lib/module-gate', () => ({
  assertModuleEnabled: (...a: unknown[]) => mockModuleGate(...(a as [])),
  assertMenuItemVisible: (...a: unknown[]) => mockMenuGate(...(a as [])),
}));
const mockPrisma: Record<string, unknown> = {};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma, isPrismaConnectivityError: () => false }));

import { ApiError } from '@/lib/http/define-route';
import { impactValue, maxDonation, parseImpact, projectProgress } from '@/lib/customer-wallet/donate/impact';
import {
  getDonationCommunity,
  getDonorStanding,
  isProjectOpen,
  makeDonation,
  pickRecommended,
  type DonationProjectDto,
} from '@/lib/customer-wallet/donate/service';

const NOW = new Date('2026-10-10T09:00:00Z');

function project(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Temiz Su',
    description: 'Kuyu',
    icon: '💧',
    category: 'water',
    goal: 1000,
    current: 900,
    impact: { unit: 'litre', perPoint: 10, label: 'Temiz su' },
    tags: ['Afrika'],
    isActive: true,
    isFeatured: false,
    archivedAt: null,
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: null,
    ...over,
  };
}

function donationRow(over: Record<string, unknown> = {}) {
  return {
    id: 'don_abc12345',
    points: 50,
    message: null,
    isPublic: false,
    createdAt: NOW,
    project: { id: 'p1', name: 'Temiz Su', icon: '💧', category: 'water', impact: { unit: 'litre', perPoint: 10, label: 'Temiz su' } },
    ...over,
  };
}

function txMock() {
  const tx = {
    pointsLedger: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    donationProject: { findUnique: jest.fn(async () => project()) },
    donation: { create: jest.fn(async () => donationRow()), findFirst: jest.fn() },
    user: { findUnique: jest.fn(async () => ({ preferredLanguage: 'tr', points: 450 })) },
    notification: { create: jest.fn(async () => ({})) },
    $queryRaw: jest.fn(async () => [{ current: 950, goal: 1000 }]),
  };
  const db = { ...tx, $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  return { tx, db };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDebit.mockResolvedValue({ id: 'u1', points: 450, xp: 0, level: 1, ledgerId: 'led1', duplicate: false });
});

describe('etki ve ilerleme yardımcıları', () => {
  it('B12: hedef 0 → yüzde yok (NaN değil); kalan ve tamamlanma doğru', () => {
    expect(projectProgress(10, 0)).toEqual({ percent: null, remaining: null, completed: false });
    expect(projectProgress(450, 1000)).toEqual({ percent: 45, remaining: 550, completed: false });
    expect(projectProgress(1000, 1000).completed).toBe(true);
  });
  it('bozuk etki JSON\'u uydurulmaz; küçük tutarda "0 fidan" yok', () => {
    expect(parseImpact({ unit: '', perPoint: 2 })).toBeNull();
    expect(parseImpact({ unit: 'fidan', perPoint: 'x' })).toBeNull();
    expect(impactValue(10, { unit: 'fidan', perPoint: 0.02, label: '' })).toBe(0.2);
  });
  it('en fazla bağış: bakiye ve hedefe kalanla sınırlı', () => {
    expect(maxDonation(500, projectProgress(900, 1000))).toBe(100);
    expect(maxDonation(80, projectProgress(0, 1000))).toBe(80);
    expect(maxDonation(500, projectProgress(0, 0))).toBe(500);
  });
  it('açık proje: arşiv, pasif, başlamamış ve süresi dolmuş kapalı', () => {
    expect(isProjectOpen(project(), NOW)).toBe(true);
    expect(isProjectOpen(project({ archivedAt: NOW }), NOW)).toBe(false);
    expect(isProjectOpen(project({ isActive: false }), NOW)).toBe(false);
    expect(isProjectOpen(project({ startDate: new Date('2026-11-01') }), NOW)).toBe(false);
    expect(isProjectOpen(project({ endDate: new Date('2026-10-01') }), NOW)).toBe(false);
  });
});

describe('makeDonation', () => {
  it('başarılı bağış: koşullu artış → bağış satırı → debitPoints(donation, idempotencyKey) → bildirim', async () => {
    const { tx, db } = txMock();
    const r = await makeDonation(db as never, { userId: 'u1', projectId: 'p1', points: 50, isPublic: false, requestKey: 'key-12345678', now: NOW });
    const sql = (tx.$queryRaw.mock.calls[0] as unknown[])[0] as { strings: string[]; values: unknown[] };
    const text = sql.strings.join('?');
    expect(text).toContain('UPDATE "DonationProject"');
    expect(text).toContain('"archivedAt" IS NULL');
    expect(text).toContain('"endDate" IS NULL OR "endDate" >');
    expect(text).toContain('"current" + ? <= "goal"');
    expect(mockDebit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 'u1', points: 50, source: 'donation', sourceId: 'don_abc12345', idempotencyKey: 'donation:u1:key-12345678' }),
    );
    expect(tx.notification.create).toHaveBeenCalled();
    expect(r).toMatchObject({ balance: 450, duplicate: false, goalReached: false });
    expect(r.receipt).toMatchObject({ receiptNo: 'QX-B-ABC12345', ledgerEntryId: 'l_led1', impact: { value: 500, unit: 'litre' } });
  });

  it('hedefi tamamlayan bağış goalReached döner', async () => {
    const { tx, db } = txMock();
    tx.$queryRaw.mockResolvedValueOnce([{ current: 1000, goal: 1000 }]);
    const r = await makeDonation(db as never, { userId: 'u1', projectId: 'p1', points: 100, isPublic: true, requestKey: 'key-12345678', now: NOW });
    expect(r.goalReached).toBe(true);
  });

  it('aynı istek anahtarı ikinci kez düşmez (çift dokunuş)', async () => {
    const { tx, db } = txMock();
    tx.pointsLedger.findUnique.mockResolvedValueOnce({ userId: 'u1', sourceId: 'don_abc12345', balanceAfter: 450 } as never);
    tx.donation.findFirst.mockResolvedValueOnce(donationRow() as never);
    const r = await makeDonation(db as never, { userId: 'u1', projectId: 'p1', points: 50, isPublic: false, requestKey: 'key-12345678', now: NOW });
    expect(r.duplicate).toBe(true);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.donation.create).not.toHaveBeenCalled();
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it('eşzamanlı aynı anahtar: debitPoints duplicate dönerse tx geri alınır, ikinci tur "zaten işlendi" yolunu döner', async () => {
    const { tx, db } = txMock();
    // 1. tur: baştaki kontrol boş (diğer istek henüz commit etmedi), borç ise duplicate döner.
    mockDebit.mockResolvedValueOnce({ id: 'u1', points: 450, xp: 0, level: 1, ledgerId: 'led1', duplicate: true });
    // 2. tur: ilk istek commit edilmiş → mevcut kayıt yolu.
    tx.pointsLedger.findUnique
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ userId: 'u1', sourceId: 'don_abc12345', balanceAfter: 450 } as never);
    tx.donation.findFirst.mockResolvedValueOnce(donationRow() as never);
    const r = await makeDonation(db as never, { userId: 'u1', projectId: 'p1', points: 50, isPublic: false, requestKey: 'key-12345678', now: NOW });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(r.duplicate).toBe(true);
    expect(r.goalReached).toBe(false);
    expect(mockDebit).toHaveBeenCalledTimes(1);
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('B5: hedefi aşan bağış reddedilir, kalan söylenir; puan düşmez', async () => {
    const { tx, db } = txMock();
    tx.$queryRaw.mockResolvedValueOnce([]);
    tx.donationProject.findUnique.mockResolvedValueOnce(project()).mockResolvedValueOnce(project({ current: 980 }));
    await expect(
      makeDonation(db as never, { userId: 'u1', projectId: 'p1', points: 50, isPublic: false, requestKey: 'key-12345678', now: NOW }),
    ).rejects.toMatchObject({ code: 'GOAL_EXCEEDED', status: 409, details: { remaining: 20 } });
    expect(tx.donation.create).not.toHaveBeenCalled();
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it('B5: süresi dolmuş projeye bağış yok', async () => {
    const { tx, db } = txMock();
    tx.donationProject.findUnique.mockResolvedValueOnce(project({ endDate: new Date('2026-10-01') }));
    await expect(
      makeDonation(db as never, { userId: 'u1', projectId: 'p1', points: 50, isPublic: false, requestKey: 'key-12345678', now: NOW }),
    ).rejects.toMatchObject({ code: 'PROJECT_CLOSED' });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('yetersiz bakiye → INSUFFICIENT_POINTS (transaction geri alınır)', async () => {
    const { db } = txMock();
    mockDebit.mockRejectedValueOnce(new MockInsufficient(10, 50));
    const p = makeDonation(db as never, { userId: 'u1', projectId: 'p1', points: 50, isPublic: false, requestKey: 'key-12345678', now: NOW });
    await expect(p).rejects.toBeInstanceOf(ApiError);
    await expect(p).rejects.toMatchObject({ code: 'INSUFFICIENT_POINTS', details: { balance: 10, required: 50 } });
  });

  it('geçersiz tutar sunucuda da reddedilir', async () => {
    const { db } = txMock();
    await expect(
      makeDonation(db as never, { userId: 'u1', projectId: 'p1', points: 0, isPublic: false, requestKey: 'key-12345678', now: NOW }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('sıra ve topluluk', () => {
  it('B3: ilk 10 dışında da gerçek sıra ve bir üst sıraya fark', async () => {
    const $queryRaw = jest.fn(async () => [{ mine: BigInt(300), ahead: BigInt(14), next_total: BigInt(420), donors: BigInt(40) }]);
    expect(await getDonorStanding({ $queryRaw } as never, 'u1')).toEqual({ publicTotal: 300, rank: 15, donors: 40, gapToNext: 121 });
    $queryRaw.mockResolvedValueOnce([{ mine: null, ahead: BigInt(40), next_total: BigInt(10), donors: BigInt(40) }]);
    expect((await getDonorStanding({ $queryRaw } as never, 'u2')).rank).toBeNull();
  });

  it('B9: başka kullanıcının kimliği yanıta girmez; ad maskeli; isMe sunucuda', async () => {
    const db = {
      $queryRaw: jest.fn(async () => [{ mine: BigInt(500), ahead: BigInt(0), next_total: null, donors: BigInt(2) }]),
      donation: {
        groupBy: jest.fn(async () => [
          { userId: 'u1', _sum: { points: 500 } },
          { userId: 'u2', _sum: { points: 200 } },
        ]),
        findMany: jest.fn(async () => [
          { id: 'd1', userId: 'u2', points: 200, createdAt: NOW, user: { name: 'Ayşe Nur Yılmaz' }, project: { name: 'Su', icon: '💧' } },
        ]),
      },
      user: { findMany: jest.fn(async () => [{ id: 'u1', name: 'Ben Kendim', level: 3 }, { id: 'u2', name: 'Ayşe Nur Yılmaz', level: 2 }]) },
    };
    const c = await getDonationCommunity(db as never, 'u1');
    expect(c.leaderboard[0]).toMatchObject({ rank: 1, isMe: true });
    expect(c.leaderboard[1]).toMatchObject({ name: 'Ayşe Y.', isMe: false });
    expect(JSON.stringify(c)).not.toContain('u2');
    expect(c.feed[0]).toMatchObject({ name: 'Ayşe Y.', isMe: false });
    expect(mockRedisSet).toHaveBeenCalled();
  });

  it('önerilen proje: en çok bağış yapılan kategoride hedefe en yakın açık proje', () => {
    const dto = (id: string, cat: string, pct: number | null, completed = false) =>
      ({ id, rawCategory: cat, featured: false, progress: { percent: pct, remaining: 10, completed } }) as unknown as DonationProjectDto;
    expect(pickRecommended([dto('a', 'water', 40), dto('b', 'health', 90), dto('c', 'water', 70)], 'water')).toBe('c');
    expect(pickRecommended([dto('a', 'water', 100, true)], null)).toBeNull();
  });
});

describe('POST /api/customer/wallet/donate', () => {
  function post(body: unknown) {
    return new NextRequest('http://localhost/api/customer/wallet/donate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'u1', role: 'CUSTOMER' } } });
    const { db } = txMock();
    Object.assign(mockPrisma, db);
  });

  it('modül kapalıysa 403 MODULE_DISABLED (puan düşmez)', async () => {
    mockModuleGate.mockResolvedValueOnce({ status: 403 } as never);
    const { POST } = await import('@/app/api/customer/wallet/donate/route');
    const res = await POST(post({ projectId: 'p1', points: 50, isPublic: false, requestKey: 'key-12345678' }), {});
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it('şema: 0 puan ve anahtarsız istek reddedilir', async () => {
    const { POST } = await import('@/app/api/customer/wallet/donate/route');
    expect((await POST(post({ projectId: 'p1', points: 0, isPublic: false, requestKey: 'key-12345678' }), {})).status).toBe(400);
    expect((await POST(post({ projectId: 'p1', points: 10, isPublic: false }), {})).status).toBe(400);
  });

  it('başarılı bağış 201 ve makbuz döner', async () => {
    const { POST } = await import('@/app/api/customer/wallet/donate/route');
    const res = await POST(post({ projectId: 'p1', points: 50, isPublic: false, requestKey: 'key-12345678' }), {});
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.receipt.receiptNo).toBe('QX-B-ABC12345');
    expect(mockDebit).toHaveBeenCalledTimes(1);
  });

  it('müşteri olmayan rol reddedilir', async () => {
    mockRequireAuth.mockResolvedValueOnce({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) });
    const { POST } = await import('@/app/api/customer/wallet/donate/route');
    const res = await POST(post({ projectId: 'p1', points: 50, isPublic: false, requestKey: 'key-12345678' }), {});
    expect(res.status).toBe(403);
  });
});
