/**
 * Cüzdan → Ödüller / Ödüllerim (m-cuzdan-oduller) sunucu mantığı.
 *
 * Kapatılan denetim bulguları (docs/audit/2026-10-08/musteri/):
 *  - customer_rewards B3/B4/B5: tek durum kaynağı; tükenmiş/süresi dolmuş/limitli ödül alınamaz;
 *    kişi başı limit kullanıcı kilidi altında; idempotent alım.
 *  - customer_rewards B1: kod bayi kasasında atomik tek kullanım; ikinci okutma 409.
 *  - customer_shop B5: pasif ürün satın alınamaz; P2002 → ALREADY_OWNED (500 değil); rozet kuşanılmaz.
 *  - customer_surprise-boxes B1/B8/B12: açılmamış kutu içeriği sızmaz; açılış tek-kez mint;
 *    "zaten açılmış" kutlama yapmaz; günlük kutu İstanbul gününe göre.
 */
const db = {
  $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(db)),
  user: { findUnique: jest.fn() },
  reward: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  userReward: {
    count: jest.fn(),
    create: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  cosmeticItem: { findFirst: jest.fn() },
  userCosmetic: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  userBadge: { count: jest.fn() },
  userSurpriseBox: { findFirst: jest.fn(), updateMany: jest.fn(), upsert: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  remedyOffer: { findMany: jest.fn() },
  notification: { create: jest.fn() },
  auditLog: { create: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: db }));

const lockUserForUpdate = jest.fn(async () => ({ id: 'u1', fraudStatus: null }));
const debitPoints = jest.fn();
const mintPoints = jest.fn();
jest.mock('@/lib/economy', () => {
  const wallet = jest.requireActual('@/lib/points-wallet');
  return {
    lockUserForUpdate: (...a: unknown[]) => lockUserForUpdate(...(a as [])),
    debitPoints: (...a: unknown[]) => debitPoints(...a),
    mintPoints: (...a: unknown[]) => mintPoints(...a),
    InsufficientPointsError: wallet.InsufficientPointsError,
  };
});
jest.mock('@/lib/achievements', () => ({ advanceAchievementProgress: jest.fn(async () => undefined) }));

import {
  boxTier,
  deriveRewardState,
  normalizeRewardCode,
  parsePassParam,
  parseRewardRules,
  pickNextGoal,
  stockInfo,
} from '@/lib/wallet-rewards/rules';
import {
  claimReward,
  ensureDailyBox,
  markPassUsed,
  openBox,
  purchaseCosmetic,
  redeemRewardCodeAtDealer,
  setCosmeticState,
} from '@/lib/wallet-rewards/mutations';
import { loadOwnedWallet, loadRewardsCatalog } from '@/lib/wallet-rewards/queries';
import { WalletError } from '@/lib/wallet-rewards/errors';
import { InsufficientPointsError } from '@/lib/points-wallet';

const NOW = new Date('2026-10-10T21:30:00.000Z'); // İstanbul: 11 Ekim 00:30

function rewardRow(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    name: 'Kahve',
    description: 'Bir kahve',
    icon: '☕',
    cost: 500,
    type: 'coupon',
    stock: 10,
    metadata: null,
    isActive: true,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

async function expectWalletError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(WalletError);
  await expect(p).rejects.toMatchObject({ code });
}

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(db));
});

describe('kurallar (saf)', () => {
  const rules = parseRewardRules(null);
  const base = { cost: 500, stock: 3, rules, balance: 1000, userClaimCount: 0, now: NOW };

  it('durum önceliği: süresi doldu > başlamadı > limit > tükendi > puan yetmiyor > alınabilir', () => {
    expect(deriveRewardState(base)).toBe('available');
    expect(deriveRewardState({ ...base, balance: 100 })).toBe('insufficient');
    expect(deriveRewardState({ ...base, balance: 100, stock: 0 })).toBe('soldOut');
    const limited = parseRewardRules({ perUserLimit: 1 });
    expect(deriveRewardState({ ...base, stock: 0, rules: limited, userClaimCount: 1 })).toBe('limitReached');
    const upcoming = parseRewardRules({ validFrom: '2026-12-01T00:00:00.000Z' });
    expect(deriveRewardState({ ...base, rules: upcoming })).toBe('upcoming');
    const expired = parseRewardRules({ validUntil: '2026-01-01T00:00:00.000Z', validFrom: '2027-01-01T00:00:00.000Z' });
    expect(deriveRewardState({ ...base, rules: expired })).toBe('expired');
  });

  it('bozuk metadata kural üretmez; stok -1 sınırsız, ≤5 az', () => {
    expect(parseRewardRules({ perUserLimit: 'x', validFrom: 'dün' })).toEqual({ perUserLimit: null, validFrom: null, validUntil: null });
    expect(stockInfo(-1)).toEqual({ kind: 'unlimited', left: null });
    expect(stockInfo(0)).toEqual({ kind: 'out', left: 0 });
    expect(stockInfo(3)).toEqual({ kind: 'low', left: 3 });
    expect(stockInfo(40)).toEqual({ kind: 'ok', left: 40 });
  });

  it('hedef: yalnız puanı yetmeyen en ucuz ödül', () => {
    expect(
      pickNextGoal([
        { id: 'a', cost: 900, state: 'insufficient' },
        { id: 'b', cost: 600, state: 'insufficient' },
        { id: 'c', cost: 100, state: 'soldOut' },
        { id: 'd', cost: 50, state: 'available' },
      ])
    ).toBe('b');
    expect(pickNextGoal([{ id: 'd', cost: 50, state: 'available' }])).toBeNull();
  });

  it('kutu kademesi içerikten; pass ve kod ayrıştırma', () => {
    expect(boxTier({ points: 60 })).toBe('common');
    expect(boxTier({ points: 150 })).toBe('rare');
    expect(boxTier({ points: 210 })).toBe('epic');
    expect(boxTier({ points: 245 })).toBe('legendary');
    expect(boxTier({ points: 0, couponCode: 'X' })).toBe('rare');
    expect(parsePassParam('reward:abc_1')).toEqual({ kind: 'reward', id: 'abc_1' });
    expect(parsePassParam('evil:1')).toBeNull();
    expect(parsePassParam('reward:<script>')).toBeNull();
    expect(normalizeRewardCode(' kpn-1a2b3c4d-xy12 ')).toBe('KPN-1A2B3C4D-XY12');
    expect(normalizeRewardCode('DROP TABLE')).toBeNull();
  });
});

describe('claimReward', () => {
  beforeEach(() => {
    db.reward.findUnique.mockResolvedValue(rewardRow());
    db.user.findUnique.mockResolvedValue({ points: 800 });
    db.reward.updateMany.mockResolvedValue({ count: 1 });
    debitPoints.mockResolvedValue({ id: 'u1', points: 300, xp: 0, level: 1, duplicate: false });
    db.userReward.create.mockResolvedValue({ id: 'ur1' });
  });

  it('kullanıcıyı kilitler, stoğu koşullu düşer, defterli borç (istek anahtarıyla), kod + bildirim + audit', async () => {
    const r = await claimReward({ userId: 'u1', rewardId: 'r1', requestKey: 'key-12345678', now: NOW });
    expect(lockUserForUpdate).toHaveBeenCalledWith(db, 'u1');
    expect(db.reward.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'r1', isActive: true, archivedAt: null, stock: { gt: 0 } }) })
    );
    expect(debitPoints).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ userId: 'u1', points: 500, source: 'reward', idempotencyKey: 'reward:u1:key-12345678' })
    );
    expect(r).toMatchObject({ userRewardId: 'ur1', newBalance: 300, cost: 500 });
    expect(r.code).toMatch(/^KPN-[0-9A-F]{8}-[0-9A-Z]{2,4}$/);
    expect(db.notification.create).toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'CLAIM_REWARD' }) }));
  });

  it('tükenmiş ödül → REWARD_SOLD_OUT ve borç yok', async () => {
    db.reward.findUnique.mockResolvedValue(rewardRow({ stock: 0 }));
    await expectWalletError(claimReward({ userId: 'u1', rewardId: 'r1', now: NOW }), 'REWARD_SOLD_OUT');
    expect(debitPoints).not.toHaveBeenCalled();
  });

  it('kişi başı limit KİLİT ALTINDA sayılır → REWARD_LIMIT_REACHED', async () => {
    db.reward.findUnique.mockResolvedValue(rewardRow({ metadata: { perUserLimit: 1 } }));
    db.userReward.count.mockResolvedValue(1);
    await expectWalletError(claimReward({ userId: 'u1', rewardId: 'r1', now: NOW }), 'REWARD_LIMIT_REACHED');
    const lockOrder = lockUserForUpdate.mock.invocationCallOrder[0];
    const countOrder = db.userReward.count.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(countOrder);
    expect(db.reward.updateMany).not.toHaveBeenCalled();
  });

  it('süresi dolmuş ödül → REWARD_EXPIRED; arşivli → REWARD_NOT_FOUND', async () => {
    db.reward.findUnique.mockResolvedValue(rewardRow({ metadata: { validUntil: '2026-10-01T00:00:00.000Z' } }));
    await expectWalletError(claimReward({ userId: 'u1', rewardId: 'r1', now: NOW }), 'REWARD_EXPIRED');
    db.reward.findUnique.mockResolvedValue(rewardRow({ archivedAt: new Date() }));
    await expectWalletError(claimReward({ userId: 'u1', rewardId: 'r1', now: NOW }), 'REWARD_NOT_FOUND');
  });

  it('puan yetmiyor → INSUFFICIENT_POINTS (eşzamanlı harcama borçta yakalanırsa da)', async () => {
    db.user.findUnique.mockResolvedValue({ points: 100 });
    await expectWalletError(claimReward({ userId: 'u1', rewardId: 'r1', now: NOW }), 'INSUFFICIENT_POINTS');
    db.user.findUnique.mockResolvedValue({ points: 800 });
    debitPoints.mockRejectedValueOnce(new InsufficientPointsError(100, 500));
    await expectWalletError(claimReward({ userId: 'u1', rewardId: 'r1', now: NOW }), 'INSUFFICIENT_POINTS');
  });

  it('aynı istek anahtarı ikinci kez → ALREADY_PROCESSED (yeni kod üretilmez)', async () => {
    debitPoints.mockResolvedValue({ id: 'u1', points: 300, xp: 0, level: 1, duplicate: true });
    await expectWalletError(claimReward({ userId: 'u1', rewardId: 'r1', requestKey: 'key-12345678', now: NOW }), 'ALREADY_PROCESSED');
    expect(db.userReward.create).not.toHaveBeenCalled();
  });
});

describe('kozmetik', () => {
  it('pasif/arşivli ürün aranmaz → COSMETIC_NOT_FOUND', async () => {
    db.cosmeticItem.findFirst.mockResolvedValue(null);
    await expectWalletError(purchaseCosmetic({ userId: 'u1', cosmeticId: 'c1', expectedPrice: 100 }), 'COSMETIC_NOT_FOUND');
    expect(db.cosmeticItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1', isActive: true, archivedAt: null } })
    );
  });

  it('fiyat değiştiyse → PRICE_CHANGED; yarışta P2002 → ALREADY_OWNED', async () => {
    db.cosmeticItem.findFirst.mockResolvedValue({ id: 'c1', name: 'Alev', price: 300, type: 'avatar_frame' });
    await expectWalletError(purchaseCosmetic({ userId: 'u1', cosmeticId: 'c1', expectedPrice: 100 }), 'PRICE_CHANGED');

    db.userCosmetic.findFirst.mockResolvedValue(null);
    debitPoints.mockResolvedValue({ id: 'u1', points: 50, duplicate: false });
    db.userCosmetic.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expectWalletError(purchaseCosmetic({ userId: 'u1', cosmeticId: 'c1', expectedPrice: 300 }), 'ALREADY_OWNED');
  });

  it('başarılı alım: doğal tek-kez anahtarı shop:<kullanıcı>:<ürün>', async () => {
    db.cosmeticItem.findFirst.mockResolvedValue({ id: 'c1', name: 'Alev', price: 300, type: 'avatar_frame' });
    db.userCosmetic.findFirst.mockResolvedValue(null);
    debitPoints.mockResolvedValue({ id: 'u1', points: 50, duplicate: false });
    db.userCosmetic.create.mockResolvedValue({});
    const r = await purchaseCosmetic({ userId: 'u1', cosmeticId: 'c1', expectedPrice: 300 });
    expect(r).toEqual({ cosmeticId: 'c1', type: 'avatar_frame', newBalance: 50 });
    expect(debitPoints).toHaveBeenCalledWith(db, expect.objectContaining({ source: 'shop', idempotencyKey: 'shop:u1:c1' }));
  });

  it('rozet kuşanılmaz (NOT_EQUIPPABLE); vitrin 4 slotu dolu → PIN_LIMIT', async () => {
    db.userCosmetic.findFirst.mockResolvedValue({ id: 'uc1', isEquipped: false, isPinned: false, cosmetic: { type: 'profile_badge' } });
    await expectWalletError(setCosmeticState({ userId: 'u1', cosmeticId: 'c1', action: 'equip' }), 'NOT_EQUIPPABLE');
    db.userCosmetic.count.mockResolvedValue(2);
    db.userBadge.count.mockResolvedValue(2);
    await expectWalletError(setCosmeticState({ userId: 'u1', cosmeticId: 'c1', action: 'pin' }), 'PIN_LIMIT');
  });

  it('çerçeve kuşanınca aynı türdekiler tek updateMany ile çıkar; oturum için güncel çerçeve döner', async () => {
    db.userCosmetic.findFirst.mockResolvedValue({ id: 'uc1', isEquipped: false, isPinned: false, cosmetic: { type: 'avatar_frame' } });
    db.userCosmetic.count.mockResolvedValue(0);
    db.userBadge.count.mockResolvedValue(0);
    db.userCosmetic.findMany.mockResolvedValue([{ cosmetic: { type: 'avatar_frame', imageUrl: 'fire_effect' } }]);
    const r = await setCosmeticState({ userId: 'u1', cosmeticId: 'c1', action: 'equip' });
    expect(db.userCosmetic.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', isEquipped: true, cosmetic: { type: 'avatar_frame' } },
      data: { isEquipped: false },
    });
    expect(r).toMatchObject({ equipped: true, equippedFrame: 'fire_effect', equippedBackground: null });
  });
});

describe('ödül kodu', () => {
  it('müşteri "kullandım": ikinci kez → PASS_ALREADY_USED; başkasınınki → PASS_NOT_FOUND', async () => {
    db.userReward.updateMany.mockResolvedValue({ count: 0 });
    db.userReward.findFirst.mockResolvedValueOnce({ claimedAt: NOW });
    await expectWalletError(markPassUsed({ userId: 'u1', userRewardId: 'ur1' }), 'PASS_ALREADY_USED');
    db.userReward.findFirst.mockResolvedValueOnce(null);
    await expectWalletError(markPassUsed({ userId: 'u1', userRewardId: 'ur9' }), 'PASS_NOT_FOUND');
    expect(db.userReward.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ur9', userId: 'u1', claimedAt: null } })
    );
  });

  it('bayi kasası: geçersiz biçim → CODE_INVALID; tek kullanım atomik, ikinci okutma 409', async () => {
    await expectWalletError(redeemRewardCodeAtDealer({ code: 'abc', dealerId: 'd1', actorId: 'd1' }), 'CODE_INVALID');

    db.userReward.findUnique.mockResolvedValue({ id: 'ur1', userId: 'c1', claimedAt: null, reward: { name: 'Kahve' } });
    db.userReward.updateMany.mockResolvedValueOnce({ count: 1 });
    db.user.findUnique.mockResolvedValue({ businessName: 'Kahve Durağı', name: null });
    const ok = await redeemRewardCodeAtDealer({ code: 'kpn-1a2b3c4d-xy12', dealerId: 'd1', actorId: 's1', now: NOW });
    expect(ok.rewardName).toBe('Kahve');
    expect(db.userReward.updateMany).toHaveBeenCalledWith({ where: { id: 'ur1', claimedAt: null }, data: { claimedAt: NOW } });
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'REDEEM_REWARD_CODE', userId: 's1' }) })
    );
    expect(db.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'c1' }) }));

    db.userReward.updateMany.mockResolvedValueOnce({ count: 0 });
    await expectWalletError(redeemRewardCodeAtDealer({ code: 'KPN-1A2B3C4D-XY12', dealerId: 'd1', actorId: 's1' }), 'PASS_ALREADY_USED');
  });
});

describe('sürpriz kutu', () => {
  const box = { id: 'b1', title: 'Günlük kutu', message: null, points: 120, couponCode: null, dayKey: '2026-10-10', openedAt: null };

  it('açılış: atomik geçiş + mintPoints tek-kez anahtarı; içerik yalnız yanıtta', async () => {
    db.userSurpriseBox.findFirst.mockResolvedValue(box);
    db.userSurpriseBox.updateMany.mockResolvedValue({ count: 1 });
    mintPoints.mockResolvedValue({ points: 1120, credited: 120 });
    const r = await openBox({ userId: 'u1', boxId: 'b1', now: NOW });
    expect(db.userSurpriseBox.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b1', userId: 'u1' } }));
    expect(mintPoints).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ userId: 'u1', points: 120, source: 'surprise', idempotencyKey: 'surprise:b1' })
    );
    expect(r).toMatchObject({ points: 120, newBalance: 1120, alreadyOpened: false, source: 'daily', tier: 'common' });
  });

  it('daha önce açılmış / yarışı kaybeden istek: kredi YOK, alreadyOpened', async () => {
    db.userSurpriseBox.findFirst.mockResolvedValue({ ...box, openedAt: NOW });
    expect(await openBox({ userId: 'u1', boxId: 'b1' })).toMatchObject({ alreadyOpened: true, newBalance: null });
    db.userSurpriseBox.findFirst.mockResolvedValue(box);
    db.userSurpriseBox.updateMany.mockResolvedValue({ count: 0 });
    expect(await openBox({ userId: 'u1', boxId: 'b1' })).toMatchObject({ alreadyOpened: true });
    expect(mintPoints).not.toHaveBeenCalled();
  });

  it('başkasının kutusu → BOX_NOT_FOUND', async () => {
    db.userSurpriseBox.findFirst.mockResolvedValue(null);
    await expectWalletError(openBox({ userId: 'u1', boxId: 'x' }), 'BOX_NOT_FOUND');
  });

  it('günlük kutu anahtarı İstanbul günü (UTC 21:30 → ertesi gün)', async () => {
    db.userSurpriseBox.upsert.mockResolvedValue({ id: 'b2', openedAt: null });
    const r = await ensureDailyBox({ userId: 'u1', now: NOW, points: 99 });
    expect(r.dayKey).toBe('2026-10-11');
    expect(db.userSurpriseBox.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_dayKey: { userId: 'u1', dayKey: '2026-10-11' } }, update: {} })
    );
  });
});

describe('okuma katmanı', () => {
  it('Ödüllerim: açılmamış kutunun puan/kupon/mesajı yanıtta YOK; bugünün kutusu listede tekrarlanmaz', async () => {
    db.userReward.findMany.mockResolvedValue([]);
    db.remedyOffer.findMany.mockResolvedValue([]);
    db.userSurpriseBox.findUnique.mockResolvedValue({ id: 'today', openedAt: null });
    db.userSurpriseBox.findMany.mockImplementation(async (args: { where: { openedAt: unknown } }) =>
      args.where.openedAt === null
        ? [
            { id: 'today', title: 'Günlük kutu', message: 'gizli', points: 200, couponCode: null, dayKey: '2026-10-11', openedAt: null, createdAt: NOW },
            { id: 'gift', title: 'Hediye', message: 'gizli mesaj', points: 900, couponCode: 'GIZLI-1', dayKey: null, openedAt: null, createdAt: NOW },
          ]
        : []
    );
    const w = await loadOwnedWallet('u1', { now: NOW });
    expect(w.boxes.unopened).toEqual([{ id: 'gift', title: 'Hediye', source: 'gift', tier: 'legendary', createdAt: NOW.toISOString() }]);
    expect(JSON.stringify(w.boxes.unopened)).not.toMatch(/GIZLI|gizli|900/);
    expect(w.boxes.daily).toMatchObject({ dayKey: '2026-10-11', boxId: 'today', opened: false });
  });

  it('katalog: ham metadata/_count sızmaz, durum ve kişi başı sayım tek groupBy ile', async () => {
    db.user.findUnique.mockResolvedValue({ points: 600 });
    db.reward.findMany.mockResolvedValue([
      rewardRow({ id: 'a', cost: 500, metadata: { perUserLimit: 1, secret: 'iç' } }),
      rewardRow({ id: 'b', cost: 900 }),
    ]);
    db.userReward.groupBy.mockResolvedValue([{ rewardId: 'a', _count: { _all: 1 } }]);
    const c = await loadRewardsCatalog('u1', { now: NOW });
    expect(db.userReward.groupBy).toHaveBeenCalledTimes(1);
    expect(c.rewards.map((r) => [r.id, r.state])).toEqual([
      ['a', 'limitReached'],
      ['b', 'insufficient'],
    ]);
    expect(c.nextGoalId).toBe('b');
    expect(JSON.stringify(c)).not.toMatch(/secret|_count|metadata/);
  });
});
