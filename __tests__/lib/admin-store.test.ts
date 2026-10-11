/**
 * /admin/rewards — Mağaza ve Ödüller sunucu çekirdeği (lib/admin-store).
 *
 * Korunan senaryolar (rapor admin_rewards + admin_shop):
 *  - B5: kısmi düzenleme maliyeti 0 yapamaz / türü serbest yazamaz (tam şemadan geçer).
 *  - B6: eski `updatedAt` ile düzenleme 409; stok yalnız göreli ve negatife düşmeden değişir.
 *  - B7: yeni ödül varsayılan TASLAK.
 *  - Kod havuzu: talep havuzdan sıradaki kodu alır, boş havuz = tükendi; müşteri GET'inde kodlar yok.
 *  - B12: talep iptali ödeneni lib/economy ile TEK-KEZ anahtarlı iade eder; çift iptal 409.
 *  - Shop Bulgu 3/4/6/9: türe göre görünüm doğrulaması, demo seti yalnız eksikleri ekler,
 *    nadirlik enum, sahibi olan ürünün türü kilitli.
 */
const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));

type Fn = jest.Mock;
const db = {
  reward: { findUnique: jest.fn(), findMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  userReward: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn(), groupBy: jest.fn() },
  userCosmetic: { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
  cosmeticItem: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn(), createMany: jest.fn() },
  pointsLedger: { findMany: jest.fn(), aggregate: jest.fn() },
  auditLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  notification: { create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

import { ZodError } from 'zod';
import { ApiError } from '@/lib/http/define-route';
import {
  cosmeticAssetError,
  isImageSrc,
  rewardUpsertSchema,
  rewardsQs,
  slugify,
  sortParam,
  splitCodes,
  REWARD_SORTS,
} from '@/lib/admin-store/contract';
import { preservePool, readPool, stripPrivateMetadata, takePoolCode } from '@/lib/admin-store/code-pool';
import { poolAction, rewardAction, updateReward } from '@/lib/admin-store/rewards.server';
import { redemptionAction } from '@/lib/admin-store/redemptions.server';
import { seedMissingDemos, updateCosmetic } from '@/lib/admin-store/cosmetics.server';
import { DEMO_COSMETICS } from '@/lib/cosmetic-demos';

const ACTOR = { id: 'admin-1', type: 'user' as const, email: 'a@x.com', role: 'ADMIN', name: 'Admin' };
const T0 = new Date('2026-10-01T10:00:00.000Z');

function resetAll(o: Record<string, unknown>) {
  for (const v of Object.values(o)) {
    if (typeof v === 'function' && 'mockReset' in v) (v as Fn).mockReset();
    else if (v && typeof v === 'object') resetAll(v as Record<string, unknown>);
  }
}

beforeEach(() => {
  resetAll(db as unknown as Record<string, unknown>);
  mockMint.mockReset();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.auditLog.create.mockResolvedValue({});
  db.notification.create.mockResolvedValue({});
  db.userReward.count.mockResolvedValue(0);
  db.userCosmetic.count.mockResolvedValue(0);
});

const rewardRow = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  name: 'Kahve',
  description: 'Bir fincan',
  icon: '☕',
  cost: 500,
  stock: 10,
  type: 'digital',
  metadata: null,
  isActive: true,
  archivedAt: null,
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

describe('sözleşme', () => {
  it('isImageSrc: R2/kök-göreli görsel evet; emoji, //, javascript: hayır', () => {
    expect(isImageSrc('https://pub.r2.dev/assets/rewards/x.svg')).toBe(true);
    expect(isImageSrc('/images/x.svg')).toBe(true);
    expect(isImageSrc('🎁')).toBe(false);
    expect(isImageSrc('//evil.com/x.png')).toBe(false);
    expect(isImageSrc('javascript:alert(1)')).toBe(false);
    expect(isImageSrc(undefined)).toBe(false);
  });

  it('ödül şeması: varsayılan taslak, -1 sınırsız, 0 maliyet ve ters tarih reddi', () => {
    const ok = rewardUpsertSchema.parse({ name: 'Kahve', description: 'Bir fincan', icon: '☕', cost: 300, stock: -1, type: 'digital' });
    expect(ok.isActive).toBe(false);
    expect(ok.stock).toBe(-1);
    expect(() => rewardUpsertSchema.parse({ ...ok, cost: 0 })).toThrow(ZodError);
    expect(() => rewardUpsertSchema.parse({ ...ok, description: '' })).toThrow(ZodError);
    expect(() => rewardUpsertSchema.parse({ ...ok, type: 'bilinmeyen' })).toThrow(ZodError);
    expect(() => rewardUpsertSchema.parse({ ...ok, icon: 'çok uzun bir metin' })).toThrow(ZodError);
    expect(() =>
      rewardUpsertSchema.parse({ ...ok, validFrom: '2026-10-10T00:00:00.000Z', validUntil: '2026-10-01T00:00:00.000Z' })
    ).toThrow(/Bitiş/);
  });

  it('kozmetik görünüm sözleşmesi türe göre', () => {
    expect(cosmeticAssetError('avatar_frame', 'fire_effect')).toBeNull();
    expect(cosmeticAssetError('avatar_frame', 'https://cdn.x/neon.png')).not.toBeNull();
    expect(cosmeticAssetError('profile_badge', 'diamond_badge')).toBeNull();
    expect(cosmeticAssetError('profile_badge', 'https://cdn.x/a.png')).toBeNull();
    expect(cosmeticAssetError('profile_background', 'bg-gradient-to-r from-pink-500')).not.toBeNull();
    expect(cosmeticAssetError('profile_background', 'https://cdn.x/bg.png')).toBeNull();
  });

  it('yardımcılar: kod bölme, Türkçe slug, sıralama eşlemesi', () => {
    expect(splitCodes('A1B2C\nD3E4F, G5H6I;  J7K8L ')).toEqual(['A1B2C', 'D3E4F', 'G5H6I', 'J7K8L']);
    expect(slugify('Işıltılı Çerçeve Ğ')).toBe('isiltili-cerceve-g');
    expect(sortParam('cost.desc', REWARD_SORTS)).toBe('-cost');
    expect(sortParam('hack.asc', REWARD_SORTS)).toBeUndefined();
    expect(rewardsQs({ q: 'k', status: 'draft', page: 1, size: 25 })).toBe('status=draft');
  });
});

describe('kod havuzu', () => {
  it('müşteri GET metadata\'sından havuz kodları çıkarılır; admin metadata yazımı havuzu korur', () => {
    const row = { id: 'r1', metadata: { perUserLimit: 1, codePoolEnabled: true, codePool: ['A', 'B'] } };
    expect(stripPrivateMetadata(row).metadata).toEqual({ perUserLimit: 1 });
    expect(preservePool({ perUserLimit: 2, codePool: ['HACK'] }, row.metadata)).toEqual({ perUserLimit: 2, codePoolEnabled: true, codePool: ['A', 'B'] });
    expect(readPool(null)).toEqual({ enabled: false, codes: [] });
  });

  it('takePoolCode sıradaki kodu alır ve havuzdan düşer; boş havuz tükendi', async () => {
    db.reward.findUnique.mockResolvedValueOnce({ metadata: { codePoolEnabled: true, codePool: ['P-1', 'P-2'] } });
    const r = await takePoolCode(db as never, 'r1');
    expect(r).toEqual({ code: 'P-1', exhausted: false });
    expect(db.reward.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { metadata: { codePoolEnabled: true, codePool: ['P-2'] } } });

    db.reward.findUnique.mockResolvedValueOnce({ metadata: { codePoolEnabled: true, codePool: [] } });
    expect(await takePoolCode(db as never, 'r1')).toEqual({ code: null, exhausted: true });

    db.reward.findUnique.mockResolvedValueOnce({ metadata: null });
    expect(await takePoolCode(db as never, 'r1')).toEqual({ code: null, exhausted: false });
  });

  it('poolAction add: geçersiz/tekrar/dağıtılmış kodlar atlanır, stok = havuz', async () => {
    db.reward.updateMany.mockResolvedValue({ count: 1 });
    db.reward.findUniqueOrThrow.mockResolvedValue({ metadata: { codePoolEnabled: true, codePool: ['OLD-1'] }, stock: 1, archivedAt: null, type: 'coupon' });
    db.userReward.findMany.mockResolvedValue([{ code: 'USED-1' }]);
    const res = await poolAction('r1', { action: 'add', codes: ['NEW-1', 'NEW-1', 'x', 'OLD-1', 'USED-1', 'NEW-2'] }, ACTOR, null);
    expect(res.added).toBe(2);
    expect(res.remaining).toBe(3);
    expect(res.skipped.map((s) => s.reason).sort()).toEqual(['duplicate', 'duplicate', 'invalid', 'issued']);
    expect(db.reward.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: 3, metadata: { codePoolEnabled: true, codePool: ['OLD-1', 'NEW-1', 'NEW-2'] } } })
    );
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

describe('ödül düzenleme ve aksiyonlar', () => {
  it('eski updatedAt → 409 STALE, yazım yok', async () => {
    db.reward.findUnique.mockResolvedValue(rewardRow());
    await expect(updateReward('r1', { expectedUpdatedAt: '2026-01-01T00:00:00.000Z', changes: { name: 'X' } }, ACTOR, null)).rejects.toMatchObject({ status: 409 });
    expect(db.reward.updateMany).not.toHaveBeenCalled();
  });

  it('kısmi PATCH maliyeti 0 yapamaz (B5)', async () => {
    db.reward.findUnique.mockResolvedValue(rewardRow());
    await expect(updateReward('r1', { expectedUpdatedAt: T0.toISOString(), changes: { cost: 0 } }, ACTOR, null)).rejects.toBeInstanceOf(ZodError);
  });

  it('geçerli düzenleme: koşullu yazım + alan farkı denetimi; stok formdan yazılmaz', async () => {
    db.reward.findUnique.mockResolvedValue(rewardRow());
    db.reward.updateMany.mockResolvedValue({ count: 1 });
    await updateReward('r1', { expectedUpdatedAt: T0.toISOString(), changes: { cost: 750, stock: 999, perUserLimit: 2 } }, ACTOR, null);
    const call = db.reward.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'r1', updatedAt: T0, archivedAt: null });
    expect(call.data.cost).toBe(750);
    expect(call.data).not.toHaveProperty('stock');
    expect(call.data.metadata).toEqual({ perUserLimit: 2 });
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('UPDATE_REWARD');
    expect(audit.newData.changes.map((c: { field: string }) => c.field).sort()).toEqual(['cost', 'perUserLimit']);
  });

  it('stok hareketi göreli ve negatife düşmez; havuz açıkken reddedilir', async () => {
    db.reward.findUnique.mockResolvedValue(rewardRow({ stock: 3 }));
    db.reward.updateMany.mockResolvedValue({ count: 0 });
    await expect(rewardAction('r1', { action: 'stock', delta: -5 }, ACTOR, null)).rejects.toBeInstanceOf(ApiError);
    expect(db.reward.updateMany).toHaveBeenCalledWith({ where: { id: 'r1', stock: { gte: 5 } }, data: { stock: { increment: -5 } } });

    db.reward.findUnique.mockResolvedValue(rewardRow({ metadata: { codePoolEnabled: true, codePool: ['A'] } }));
    await expect(rewardAction('r1', { action: 'stock', delta: 5 }, ACTOR, null)).rejects.toMatchObject({ status: 409 });
  });

  it('arşivden geri alınan ödül TASLAK döner', async () => {
    db.reward.findUnique.mockResolvedValue(rewardRow({ archivedAt: T0, isActive: false }));
    await rewardAction('r1', { action: 'restore' }, ACTOR, null).catch(() => undefined);
    expect(db.reward.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { archivedAt: null, isActive: false } });
  });
});

describe('talep iptali + iade (B12)', () => {
  const ur = {
    id: 'ur1',
    code: 'DJT-AAAA-BB',
    redeemedAt: T0,
    claimedAt: null,
    userId: 'u1',
    rewardId: 'r1',
    user: { id: 'u1', name: 'Ayşe', email: 'a@y.com' },
    reward: { id: 'r1', name: 'Kahve', type: 'digital', icon: '☕' },
  };

  it('bekleyen talep: ödenen puan tek-kez anahtarla iade, stok +1, denetim', async () => {
    db.userReward.findUnique.mockResolvedValue(ur);
    db.userReward.updateMany.mockResolvedValue({ count: 1 });
    db.pointsLedger.findMany.mockImplementation(async (args: { where: { source?: string } }) =>
      args.where.source === 'reward' ? [{ id: 'l1', userId: 'u1', sourceId: 'r1', delta: -500, createdAt: new Date(T0.getTime() - 50) }] : []
    );
    db.reward.findUnique.mockResolvedValue({ stock: 4, metadata: null });
    db.auditLog.findMany.mockResolvedValue([]);
    mockMint.mockResolvedValue({ credited: 500 });

    await redemptionAction('ur1', { action: 'cancel', reason: 'Stok bitti' }, ACTOR, null);

    expect(db.userReward.updateMany).toHaveBeenCalledWith({ where: { id: 'ur1', claimedAt: null }, data: { claimedAt: expect.any(Date) } });
    expect(mockMint).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ userId: 'u1', points: 500, source: 'reward_refund', idempotencyKey: 'reward-refund:ur1', capCategory: null, fraudGate: false })
    );
    expect(db.reward.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { stock: { increment: 1 } } });
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: 'CANCEL_USER_REWARD', entity: 'UserReward', entityId: 'ur1' });
    expect(audit.newData).toMatchObject({ paidPoints: 500, refundedPoints: 500 });
  });

  it('kullanılmış/iptal edilmiş talep tekrar iptal edilemez (çift iade yok)', async () => {
    db.userReward.findUnique.mockResolvedValue({ ...ur, claimedAt: T0 });
    db.userReward.updateMany.mockResolvedValue({ count: 0 });
    await expect(redemptionAction('ur1', { action: 'cancel', reason: 'Tekrar' }, ACTOR, null)).rejects.toMatchObject({ status: 409 });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('ödemesiz (admin hediyesi) talep: iade yapılmaz', async () => {
    db.userReward.findUnique.mockResolvedValue(ur);
    db.userReward.updateMany.mockResolvedValue({ count: 1 });
    db.pointsLedger.findMany.mockResolvedValue([]);
    db.reward.findUnique.mockResolvedValue({ stock: -1, metadata: null });
    db.auditLog.findMany.mockResolvedValue([]);
    await redemptionAction('ur1', { action: 'cancel', reason: 'Yanlış hediye' }, ACTOR, null);
    expect(mockMint).not.toHaveBeenCalled();
    expect(db.reward.update).not.toHaveBeenCalled();
  });

  it('admin hediyesi, aynı ödülün yakın zamanlı satın alma borcunu "ödeme" sanıp puan basmaz', async () => {
    db.userReward.findUnique.mockResolvedValue(ur);
    db.userReward.updateMany.mockResolvedValue({ count: 1 });
    // Aynı kullanıcı aynı ödülü hediyeden 50 ms önce kendi puanıyla almış (başka talep satırı).
    db.pointsLedger.findMany.mockImplementation(async (args: { where: { source?: string } }) =>
      args.where.source === 'reward' ? [{ id: 'l1', userId: 'u1', sourceId: 'r1', delta: -500, createdAt: new Date(T0.getTime() - 50) }] : []
    );
    db.auditLog.findMany.mockImplementation(async (args: { where: { action?: string } }) =>
      args.where.action === 'grant_reward' ? [{ entityId: 'ur1' }] : []
    );
    db.reward.findUnique.mockResolvedValue({ stock: 3, metadata: null });
    await redemptionAction('ur1', { action: 'cancel', reason: 'Yanlış hediye' }, ACTOR, null);
    expect(mockMint).not.toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data.newData).toMatchObject({ paidPoints: 0, refundedPoints: 0 });
  });
});

describe('kozmetik', () => {
  const row = {
    id: 'c1',
    slug: 'hellfire-frame',
    name: 'Hellfire',
    description: null,
    type: 'avatar_frame',
    price: 5000,
    imageUrl: 'fire_effect',
    rarity: 'legendary',
    isActive: true,
    archivedAt: null,
    createdAt: T0,
  };

  it('sahibi olan ürünün türü değiştirilemez (Bulgu 9)', async () => {
    db.cosmeticItem.findUnique.mockResolvedValue(row);
    db.userCosmetic.count.mockResolvedValue(3);
    const expected = { name: 'Hellfire', slug: 'hellfire-frame', description: null, type: 'avatar_frame', price: 5000, asset: 'fire_effect', rarity: 'legendary', isActive: true };
    await expect(
      updateCosmetic('c1', { expected, changes: { type: 'profile_badge', asset: 'diamond_badge' } }, ACTOR, null)
    ).rejects.toMatchObject({ status: 409 });
    expect(db.cosmeticItem.update).not.toHaveBeenCalled();
  });

  it('başkası arada fiyatı değiştirdiyse 409 (iyimser kilit)', async () => {
    db.cosmeticItem.findUnique.mockResolvedValue({ ...row, price: 6000 });
    await expect(updateCosmetic('c1', { expected: { price: 5000 }, changes: { price: 4000 } }, ACTOR, null)).rejects.toMatchObject({ status: 409 });
  });

  it('URL\'li çerçeve kaydedilemez (Bulgu 3)', async () => {
    db.cosmeticItem.findUnique.mockResolvedValue(row);
    await expect(
      updateCosmetic('c1', { expected: { asset: 'fire_effect' }, changes: { asset: 'https://cdn.x/neon.png' } }, ACTOR, null)
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('demo seti yalnız EKSİKLERİ satışta-değil ekler; mevcutları ezmez (Bulgu 4)', async () => {
    const have = DEMO_COSMETICS.slice(0, 2).map((d) => ({ slug: d.slug }));
    db.cosmeticItem.findMany.mockResolvedValue(have);
    db.cosmeticItem.createMany.mockResolvedValue({ count: 1 });
    const res = await seedMissingDemos(ACTOR, null);
    const data = db.cosmeticItem.createMany.mock.calls[0][0].data as Array<{ slug: string; isActive: boolean }>;
    expect(data.every((d) => d.isActive === false)).toBe(true);
    expect(data.some((d) => have.some((h) => h.slug === d.slug))).toBe(false);
    expect(res.added).toEqual(data.map((d) => d.slug));
    expect(db.cosmeticItem.update).not.toHaveBeenCalled();
  });
});
