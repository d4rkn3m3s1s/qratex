/**
 * P0-14 — tek rozet servisi (lib/badges/award.ts) ve self-award ucunun kaldırılması.
 *
 * Saldırı senaryosu (eski): müşteri `POST /api/gamification/progress { badgeId }` ile koşulsuz
 * rozet + `requirement.value` (10.000'e kadar) puan alabiliyordu. Artık uç yok; rozet yalnız
 * `awardBadge` ile veriliyor: aktiflik/arşiv/gizlilik kontrolü, unique guard, mintPoints ile
 * tek-kez ödül (badge:<user>:<badge> anahtarı) ve An Motoru anı aynı tx'te.
 * Gerçek DB'ye GİDİLMEZ: tx mock'tur.
 */
const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({
  mintPoints: (...a: unknown[]) => mockMint(...a),
}));
const mockRecordBadgeMoment = jest.fn();
jest.mock(
  '@/lib/moments/server',
  () => ({ recordBadgeMoment: (...a: unknown[]) => mockRecordBadgeMoment(...a) }),
  { virtual: true }
);
jest.mock('@/lib/badge-reward-points', () => ({
  badgeRewardPoints: (id: string) => (id === 'badge-yeni-ses' ? 50 : 0),
}));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { awardBadge, awardBadgeInTx } from '@/lib/badges/award';

type BadgeRow = {
  id: string;
  name: string;
  icon: string;
  rarity: string;
  color: string | null;
  hiddenUntilEarned: boolean;
  isActive: boolean;
  archivedAt: Date | null;
};

function badgeRow(over: Partial<BadgeRow> = {}): BadgeRow {
  return {
    id: 'badge-yeni-ses',
    name: 'Yeni Ses',
    icon: '🎤',
    rarity: 'common',
    color: null,
    hiddenUntilEarned: false,
    isActive: true,
    archivedAt: null,
    ...over,
  };
}

function makeTx(opts: { badge?: BadgeRow | null; createdCount?: number } = {}) {
  return {
    badge: { findUnique: jest.fn(async () => (opts.badge === undefined ? badgeRow() : opts.badge)) },
    userBadge: {
      createMany: jest.fn(async () => ({ count: opts.createdCount ?? 1 })),
      findUnique: jest.fn(async () => ({ id: 'ub1' })),
    },
  };
}

beforeEach(() => {
  mockMint.mockReset().mockResolvedValue({ credited: 50, duplicate: false });
  mockRecordBadgeMoment.mockReset().mockResolvedValue(undefined);
});

describe('awardBadgeInTx', () => {
  it('yeni rozet: unique guard + mintPoints (tek-kez anahtarı) + An Motoru anı aynı tx istemcisiyle', async () => {
    const tx = makeTx();
    const r = await awardBadgeInTx(tx as never, { userId: 'u1', badgeId: 'badge-yeni-ses', source: 'activity' });
    expect(r).toMatchObject({ awarded: true, points: 50, userBadgeId: 'ub1' });
    expect(tx.userBadge.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u1', badgeId: 'badge-yeni-ses' }],
      skipDuplicates: true,
    });
    expect(mockMint).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: 'u1',
        points: 50,
        source: 'badge',
        idempotencyKey: 'badge:u1:badge-yeni-ses',
      })
    );
    expect(mockRecordBadgeMoment).toHaveBeenCalledWith(
      tx,
      'u1',
      expect.objectContaining({ id: 'badge-yeni-ses', name: 'Yeni Ses', rarity: 'common' })
    );
  });

  it('zaten sahip (yarış / tekrar çağrı): puan basılmaz, an yazılmaz', async () => {
    const tx = makeTx({ createdCount: 0 });
    const r = await awardBadgeInTx(tx as never, { userId: 'u1', badgeId: 'badge-yeni-ses', source: 'surprise' });
    expect(r).toMatchObject({ awarded: false, reason: 'ALREADY_OWNED' });
    expect(mockMint).not.toHaveBeenCalled();
    expect(mockRecordBadgeMoment).not.toHaveBeenCalled();
  });

  it('pasif ya da arşivlenmiş rozet varsayılan olarak verilmez', async () => {
    for (const badge of [badgeRow({ isActive: false }), badgeRow({ archivedAt: new Date() })]) {
      const tx = makeTx({ badge });
      const r = await awardBadgeInTx(tx as never, { userId: 'u1', badgeId: badge.id, source: 'activity' });
      expect(r).toMatchObject({ awarded: false, reason: 'BADGE_INACTIVE' });
      expect(tx.userBadge.createMany).not.toHaveBeenCalled();
    }
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('satın alma yolu sürpriz rozeti veremez (allowHidden=false)', async () => {
    const tx = makeTx({ badge: badgeRow({ hiddenUntilEarned: true }) });
    const r = await awardBadgeInTx(tx as never, {
      userId: 'u1',
      badgeId: 'badge-yeni-ses',
      source: 'purchase',
      allowHidden: false,
      reward: 'none',
    });
    expect(r).toMatchObject({ awarded: false, reason: 'BADGE_HIDDEN' });
    expect(tx.userBadge.createMany).not.toHaveBeenCalled();
  });

  it("reward: 'none' → rozet verilir, puan basılmaz (satın alma / admin / etkinlik)", async () => {
    const tx = makeTx();
    const r = await awardBadgeInTx(tx as never, {
      userId: 'u1',
      badgeId: 'badge-yeni-ses',
      source: 'admin',
      reward: 'none',
    });
    expect(r).toMatchObject({ awarded: true, points: 0 });
    expect(mockMint).not.toHaveBeenCalled();
    expect(mockRecordBadgeMoment).toHaveBeenCalledTimes(1);
  });

  it('rozet geri alınıp yeniden verilirse ödül ikinci kez basılmaz (defter duplicate → 0)', async () => {
    mockMint.mockResolvedValueOnce({ credited: 50, duplicate: true });
    const tx = makeTx();
    const r = await awardBadgeInTx(tx as never, { userId: 'u1', badgeId: 'badge-yeni-ses', source: 'character' });
    expect(r).toMatchObject({ awarded: true, points: 0 });
  });

  it('katalogda olmayan rozet: FK hatası yerine BADGE_NOT_FOUND', async () => {
    const tx = makeTx({ badge: null });
    const r = await awardBadgeInTx(tx as never, { userId: 'u1', badgeId: 'yok', source: 'activity' });
    expect(r).toMatchObject({ awarded: false, reason: 'BADGE_NOT_FOUND' });
  });
});

describe('awardBadge', () => {
  it('kök istemcide kendi transaction’ını açar', async () => {
    const tx = makeTx();
    const root = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
    const r = await awardBadge(root as never, { userId: 'u1', badgeId: 'badge-yeni-ses', source: 'activity' });
    expect(root.$transaction).toHaveBeenCalledTimes(1);
    expect(r.awarded).toBe(true);
  });
});

describe('P0-14: self-award ucu kaldırıldı', () => {
  it('POST /api/gamification/progress artık tanımlı değil (Next 405 döner)', async () => {
    jest.resetModules();
    jest.doMock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
    jest.doMock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));
    jest.doMock('@/lib/timezone', () => ({ startOfDayUTC: jest.fn(), startOfWeekUTC: jest.fn() }));
    const route = (await import('@/app/api/gamification/progress/route')) as Record<string, unknown>;
    expect(route.POST).toBeUndefined();
    expect(typeof route.GET).toBe('function');
  });
});
