/**
 * Cüzdan → Ödüller / Ödüllerim yazma katmanı. Puan yalnız `lib/economy` üzerinden akar:
 * harcama `debitPoints` (defterli, eksi bakiye imkânsız), kutu kredisi `mintPoints`
 * (kilit + tek-kez anahtar + `points_credited`).
 *
 * Eşzamanlılık: ödül alımı kullanıcı satırını `FOR UPDATE` kilitler → kişi başı limit sayımı
 * ile oluşturma arasında ikinci istek araya giremez (eski READ COMMITTED yarışı kapandı).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { debitPoints, InsufficientPointsError, lockUserForUpdate, mintPoints } from '@/lib/economy';
import { isUniqueViolation } from '@/lib/economy/errors';
import { istanbulDayKey } from '@/lib/quests/period';
import { generateRewardCode, dailyBoxPoints } from './codes';
import { WalletError } from './errors';
import {
  COSMETIC_PIN_LIMIT,
  boxSource,
  boxTier,
  cosmeticType,
  deriveRewardState,
  isEquippable,
  normalizeRewardCode,
  parseRewardRules,
} from './rules';
import type {
  ClaimRewardResult,
  CosmeticStateResult,
  PurchaseCosmeticResult,
  RevealPayload,
} from './types';

type Db = typeof prisma;
type Tx = Prisma.TransactionClient;
type AuditMeta = { ipAddress: string | null; userAgent: string | null };

const KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

function safeKey(key: string | null | undefined): string | null {
  return key && KEY_RE.test(key) ? key : null;
}

// ───────────────────────── Ödül alımı ─────────────────────────

export async function claimReward(
  input: { userId: string; rewardId: string; requestKey?: string | null; audit?: AuditMeta; now?: Date },
  db: Db = prisma
): Promise<ClaimRewardResult> {
  const { userId, rewardId } = input;
  const now = input.now ?? new Date();
  const requestKey = safeKey(input.requestKey);

  try {
    return await db.$transaction(async (tx) => {
      await lockUserForUpdate(tx, userId);

      const [reward, wallet] = await Promise.all([
        tx.reward.findUnique({
          where: { id: rewardId },
          select: { id: true, name: true, cost: true, stock: true, type: true, metadata: true, isActive: true, archivedAt: true },
        }),
        tx.user.findUnique({ where: { id: userId }, select: { points: true } }),
      ]);
      if (!reward || !reward.isActive || reward.archivedAt) {
        throw new WalletError('REWARD_NOT_FOUND', 'Bu ödül artık katalogda değil.');
      }

      const rules = parseRewardRules(reward.metadata);
      const claimCount = rules.perUserLimit !== null
        ? await tx.userReward.count({ where: { userId, rewardId: reward.id } })
        : 0;
      const state = deriveRewardState({
        cost: reward.cost,
        stock: reward.stock,
        rules,
        balance: wallet?.points ?? 0,
        userClaimCount: claimCount,
        now,
      });
      if (state === 'expired') throw new WalletError('REWARD_EXPIRED', 'Bu ödülün kampanya süresi doldu.');
      if (state === 'upcoming') {
        throw new WalletError('REWARD_UPCOMING', 'Bu ödül henüz alınamıyor.', { validFrom: rules.validFrom?.toISOString() ?? null });
      }
      if (state === 'limitReached') {
        throw new WalletError('REWARD_LIMIT_REACHED', 'Bu ödül için kişi başı alım sınırına ulaştın.', { limit: rules.perUserLimit });
      }
      if (state === 'soldOut') throw new WalletError('REWARD_SOLD_OUT', 'Bu ödülün stoğu tükendi.');
      if (state === 'insufficient') {
        throw new WalletError('INSUFFICIENT_POINTS', 'Puanın bu ödül için yeterli değil.', {
          required: reward.cost,
          current: wallet?.points ?? 0,
        });
      }

      // Stok + "hâlâ aktif" koşullu yazım (admin arada arşivlediyse alım olmaz).
      const guard = await tx.reward.updateMany({
        where: { id: reward.id, isActive: true, archivedAt: null, ...(reward.stock >= 0 ? { stock: { gt: 0 } } : {}) },
        data: reward.stock >= 0 ? { stock: { decrement: 1 } } : { updatedAt: now },
      });
      if (guard.count === 0) throw new WalletError('REWARD_SOLD_OUT', 'Bu ödülün stoğu tükendi.');

      const debit = await debitPoints(tx, {
        userId,
        points: reward.cost,
        source: 'reward',
        sourceId: reward.id,
        idempotencyKey: requestKey ? `reward:${userId}:${requestKey}` : null,
        reason: `Ödül: ${reward.name}`.slice(0, 200),
      });
      if (debit.duplicate) {
        // Aynı istek anahtarı daha önce işlendi: stok düşümü dahil bu tx geri alınır.
        throw new WalletError('ALREADY_PROCESSED', 'Bu talep zaten işlendi. Ödüllerim sayfasına bak.');
      }

      const code = generateRewardCode(reward.type, now);
      const userReward = await tx.userReward.create({
        data: { userId, rewardId: reward.id, code },
        select: { id: true },
      });

      await tx.notification.create({
        data: {
          userId,
          title: 'Ödülün hazır',
          message: `${reward.name} ödülünün kodu Ödüllerim'de seni bekliyor.`,
          type: 'success',
          data: { type: 'reward_claimed', rewardId: reward.id, userRewardId: userReward.id, href: `/customer/wallet/owned?pass=reward:${userReward.id}` },
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'CLAIM_REWARD',
          entity: 'Reward',
          entityId: reward.id,
          newData: { rewardId: reward.id, rewardName: reward.name, userRewardId: userReward.id, cost: reward.cost, remainingPoints: debit.points },
          ipAddress: input.audit?.ipAddress ?? null,
          userAgent: input.audit?.userAgent ?? null,
        },
      });

      return { userRewardId: userReward.id, code, rewardName: reward.name, cost: reward.cost, newBalance: debit.points };
    });
  } catch (err) {
    if (err instanceof InsufficientPointsError) {
      throw new WalletError('INSUFFICIENT_POINTS', 'Puanın bu ödül için yeterli değil.', {
        required: err.requiredPoints,
        current: err.currentPoints,
      });
    }
    throw err;
  }
}

// ───────────────────────── Kozmetik ─────────────────────────

export async function purchaseCosmetic(
  input: { userId: string; cosmeticId: string; expectedPrice?: number | null },
  db: Db = prisma
): Promise<PurchaseCosmeticResult> {
  const { userId, cosmeticId } = input;
  const item = await db.cosmeticItem.findFirst({
    where: { id: cosmeticId, isActive: true, archivedAt: null },
    select: { id: true, name: true, price: true, type: true },
  });
  if (!item) throw new WalletError('COSMETIC_NOT_FOUND', 'Bu ürün artık satışta değil.');
  if (typeof input.expectedPrice === 'number' && input.expectedPrice !== item.price) {
    throw new WalletError('PRICE_CHANGED', 'Ürünün fiyatı değişti. Güncel fiyatı kontrol edip tekrar dene.', { price: item.price });
  }

  let newBalance = 0;
  try {
    await db.$transaction(async (tx) => {
      const already = await tx.userCosmetic.findFirst({ where: { userId, cosmeticId }, select: { id: true } });
      if (already) throw new WalletError('ALREADY_OWNED', 'Bu ürün zaten koleksiyonunda.');
      // Sahiplik tektir (@@unique userId+cosmeticId) → anahtar doğal tek-kez garantisi.
      const debit = await debitPoints(tx, {
        userId,
        points: item.price,
        source: 'shop',
        sourceId: item.id,
        idempotencyKey: `shop:${userId}:${item.id}`,
        reason: `Kozmetik: ${item.name}`.slice(0, 200),
      });
      if (debit.duplicate) throw new WalletError('ALREADY_OWNED', 'Bu ürün zaten koleksiyonunda.');
      await tx.userCosmetic.create({ data: { userId, cosmeticId, isEquipped: false } });
      newBalance = debit.points;
    });
  } catch (err) {
    if (err instanceof InsufficientPointsError) {
      throw new WalletError('INSUFFICIENT_POINTS', 'Puanın bu ürün için yeterli değil.', {
        required: err.requiredPoints,
        current: err.currentPoints,
      });
    }
    if (isUniqueViolation(err)) throw new WalletError('ALREADY_OWNED', 'Bu ürün zaten koleksiyonunda.');
    throw err;
  }

  try {
    const { advanceAchievementProgress } = await import('@/lib/achievements');
    await advanceAchievementProgress(userId, 'quest-cosmetic-collector', 1, 'increment');
  } catch (e) {
    console.error('[wallet-rewards] koleksiyoncu başarımı ilerletilemedi', e);
  }

  return { cosmeticId: item.id, type: cosmeticType(item.type), newBalance };
}

export type CosmeticAction = 'equip' | 'unequip' | 'pin' | 'unpin';

async function equippedSnapshot(tx: Tx | Db, userId: string): Promise<{ frame: string | null; background: string | null }> {
  const rows = await tx.userCosmetic.findMany({
    where: { userId, isEquipped: true },
    select: { cosmetic: { select: { type: true, imageUrl: true } } },
    take: 10,
  });
  return {
    frame: rows.find((r) => r.cosmetic.type === 'avatar_frame')?.cosmetic.imageUrl ?? null,
    background: rows.find((r) => r.cosmetic.type === 'profile_background')?.cosmetic.imageUrl ?? null,
  };
}

/**
 * Kuşan / çıkar (çerçeve, arka plan — tür başına tek aktif, `updateMany` ile) ve
 * vitrine sabitle / kaldır (rozetler dahil; toplam 4 slot, rozetlerle ortak).
 */
export async function setCosmeticState(
  input: { userId: string; cosmeticId: string; action: CosmeticAction },
  db: Db = prisma
): Promise<CosmeticStateResult> {
  const { userId, cosmeticId, action } = input;
  const result = await db.$transaction(async (tx) => {
    await lockUserForUpdate(tx, userId);
    const own = await tx.userCosmetic.findFirst({
      where: { userId, cosmeticId },
      select: { id: true, isEquipped: true, isPinned: true, cosmetic: { select: { type: true } } },
    });
    if (!own) throw new WalletError('NOT_OWNED', 'Bu ürün koleksiyonunda değil.');
    const type = cosmeticType(own.cosmetic.type);
    let equipped = own.isEquipped;
    let pinned = own.isPinned;

    if (action === 'equip' || action === 'unequip') {
      if (!isEquippable(type)) {
        throw new WalletError('NOT_EQUIPPABLE', 'Rozetler kuşanılmaz; vitrine sabitlenir.');
      }
      if (action === 'equip') {
        await tx.userCosmetic.updateMany({
          where: { userId, isEquipped: true, cosmetic: { type: own.cosmetic.type } },
          data: { isEquipped: false },
        });
      }
      await tx.userCosmetic.update({ where: { id: own.id }, data: { isEquipped: action === 'equip' } });
      equipped = action === 'equip';
    } else {
      if (action === 'pin' && !own.isPinned) {
        const [c, b] = await Promise.all([
          tx.userCosmetic.count({ where: { userId, isPinned: true } }),
          tx.userBadge.count({ where: { userId, isPinned: true } }),
        ]);
        if (c + b >= COSMETIC_PIN_LIMIT) {
          throw new WalletError('PIN_LIMIT', `Vitrinde en fazla ${COSMETIC_PIN_LIMIT} öge sergilenebilir. Önce birini kaldır.`, {
            limit: COSMETIC_PIN_LIMIT,
          });
        }
      }
      await tx.userCosmetic.update({ where: { id: own.id }, data: { isPinned: action === 'pin' } });
      pinned = action === 'pin';
    }

    const [c, b, snap] = await Promise.all([
      tx.userCosmetic.count({ where: { userId, isPinned: true } }),
      tx.userBadge.count({ where: { userId, isPinned: true } }),
      equippedSnapshot(tx, userId),
    ]);
    return { cosmeticId, equipped, pinned, pinsUsed: c + b, equippedFrame: snap.frame, equippedBackground: snap.background };
  });

  if (action === 'pin' || action === 'unpin') {
    try {
      const { advanceAchievementProgress } = await import('@/lib/achievements');
      await advanceAchievementProgress(userId, 'quest-showcase-master', result.pinsUsed, 'set');
    } catch (e) {
      console.error('[wallet-rewards] vitrin başarımı ilerletilemedi', e);
    }
  }
  return result;
}

// ───────────────────────── Ödül kodu (pass) ─────────────────────────

/** Müşteri kendi kodunu "kullandım" olarak işaretler (tek yön; geri alınmaz). */
export async function markPassUsed(
  input: { userId: string; userRewardId: string; now?: Date },
  db: Db = prisma
): Promise<{ id: string; usedAt: string }> {
  const now = input.now ?? new Date();
  const n = await db.userReward.updateMany({
    where: { id: input.userRewardId, userId: input.userId, claimedAt: null },
    data: { claimedAt: now },
  });
  if (n.count === 0) {
    const row = await db.userReward.findFirst({
      where: { id: input.userRewardId, userId: input.userId },
      select: { claimedAt: true },
    });
    if (!row) throw new WalletError('PASS_NOT_FOUND', 'Ödül kodu bulunamadı.');
    throw new WalletError('PASS_ALREADY_USED', 'Bu kod zaten kullanılmış.', { usedAt: row.claimedAt?.toISOString() ?? null });
  }
  return { id: input.userRewardId, usedAt: now.toISOString() };
}

export interface CodeLookup {
  rewardName: string;
  status: 'active' | 'used';
  issuedAt: string;
  usedAt: string | null;
}

/** Bayi kasası: kod doğrulama (salt okuma). Kod platform geneli olduğundan her işletmede geçerlidir. */
export async function lookupRewardCode(rawCode: unknown, db: Db = prisma): Promise<CodeLookup> {
  const code = normalizeRewardCode(rawCode);
  if (!code) throw new WalletError('CODE_INVALID', 'Kod biçimi geçersiz. Örnek: KPN-1A2B3C4D-XY12');
  const row = await db.userReward.findUnique({
    where: { code },
    select: { redeemedAt: true, claimedAt: true, reward: { select: { name: true } } },
  });
  if (!row) throw new WalletError('PASS_NOT_FOUND', 'Bu kodla bir ödül bulunamadı.');
  return {
    rewardName: row.reward.name,
    status: row.claimedAt ? 'used' : 'active',
    issuedAt: row.redeemedAt.toISOString(),
    usedAt: row.claimedAt?.toISOString() ?? null,
  };
}

/** Bayi kasası: kodu atomik tek kullanımla tüketir + denetim izi + müşteriye bildirim. */
export async function redeemRewardCodeAtDealer(
  input: { code: unknown; dealerId: string; actorId: string; audit?: AuditMeta; now?: Date },
  db: Db = prisma
): Promise<{ rewardName: string; usedAt: string }> {
  const code = normalizeRewardCode(input.code);
  if (!code) throw new WalletError('CODE_INVALID', 'Kod biçimi geçersiz. Örnek: KPN-1A2B3C4D-XY12');
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const row = await tx.userReward.findUnique({
      where: { code },
      select: { id: true, userId: true, claimedAt: true, reward: { select: { name: true } } },
    });
    if (!row) throw new WalletError('PASS_NOT_FOUND', 'Bu kodla bir ödül bulunamadı.');
    const n = await tx.userReward.updateMany({ where: { id: row.id, claimedAt: null }, data: { claimedAt: now } });
    if (n.count === 0) {
      throw new WalletError('PASS_ALREADY_USED', 'Bu kod daha önce kullanılmış.', { usedAt: row.claimedAt?.toISOString() ?? null });
    }
    const dealer = await tx.user.findUnique({ where: { id: input.dealerId }, select: { businessName: true, name: true } });
    const place = dealer?.businessName || dealer?.name || 'işletme';
    await tx.auditLog.create({
      data: {
        userId: input.actorId,
        action: 'REDEEM_REWARD_CODE',
        entity: 'UserReward',
        entityId: row.id,
        newData: { dealerId: input.dealerId, rewardName: row.reward.name, customerId: row.userId, usedAt: now.toISOString() },
        ipAddress: input.audit?.ipAddress ?? null,
        userAgent: input.audit?.userAgent ?? null,
      },
    });
    await tx.notification.create({
      data: {
        userId: row.userId,
        title: 'Ödülün kullanıldı',
        message: `${row.reward.name} ödülün ${place} kasasında kullanıldı.`,
        type: 'info',
        data: { type: 'reward_redeemed', userRewardId: row.id, href: `/customer/wallet/owned?pass=reward:${row.id}` },
      },
    });
    return { rewardName: row.reward.name, usedAt: now.toISOString() };
  });
}

// ───────────────────────── Sürpriz kutu ─────────────────────────

/**
 * Bugünün (İstanbul günü) kutusunu oluşturur — yalnız müşteri "Aç" dediğinde (POST).
 * `@@unique([userId, dayKey])` aynı gün ikinci kutuyu veritabanında engeller.
 */
export async function ensureDailyBox(
  input: { userId: string; now?: Date; points?: number },
  db: Db = prisma
): Promise<{ id: string; opened: boolean; dayKey: string }> {
  const now = input.now ?? new Date();
  const dayKey = istanbulDayKey(now);
  const points = input.points ?? dailyBoxPoints();
  const box = await db.userSurpriseBox.upsert({
    where: { userId_dayKey: { userId: input.userId, dayKey } },
    update: {},
    create: {
      userId: input.userId,
      dayKey,
      title: 'Günlük kutu',
      message: 'Her gün yeni bir kutu seni bekliyor. Yarın yine gel!',
      points,
      rewardType: 'points',
    },
    select: { id: true, openedAt: true },
  });
  return { id: box.id, opened: !!box.openedAt, dayKey };
}

function revealOf(
  box: { id: string; title: string; message: string | null; points: number; couponCode: string | null; dayKey: string | null },
  extra: { newBalance: number | null; alreadyOpened: boolean }
): RevealPayload {
  return {
    boxId: box.id,
    title: box.title,
    message: box.message,
    source: boxSource(box),
    tier: boxTier(box),
    points: box.points,
    couponCode: box.couponCode,
    newBalance: extra.newBalance,
    alreadyOpened: extra.alreadyOpened,
  };
}

/**
 * Kutuyu açar: atomik `openedAt` geçişi + puan `mintPoints` ile (tek-kez anahtar
 * `surprise:<kutuId>`, defter + `points_credited`). İçerik yalnız bu yanıtta döner.
 */
export async function openBox(
  input: { userId: string; boxId: string; now?: Date },
  db: Db = prisma
): Promise<RevealPayload> {
  const now = input.now ?? new Date();
  const select = { id: true, title: true, message: true, points: true, couponCode: true, dayKey: true, openedAt: true } as const;
  const box = await db.userSurpriseBox.findFirst({ where: { id: input.boxId, userId: input.userId }, select });
  if (!box) throw new WalletError('BOX_NOT_FOUND', 'Kutu bulunamadı.');
  if (box.openedAt) return revealOf(box, { newBalance: null, alreadyOpened: true });

  return db.$transaction(async (tx) => {
    const claimed = await tx.userSurpriseBox.updateMany({
      where: { id: box.id, userId: input.userId, openedAt: null },
      data: { openedAt: now },
    });
    if (claimed.count === 0) return revealOf(box, { newBalance: null, alreadyOpened: true });

    let newBalance: number | null = null;
    if (box.points > 0) {
      const minted = await mintPoints(tx, {
        userId: input.userId,
        points: box.points,
        source: 'surprise',
        sourceId: box.id,
        idempotencyKey: `surprise:${box.id}`,
        meta: { boxSource: boxSource(box), tier: boxTier(box) },
        now,
      });
      newBalance = minted.points;
    }
    return revealOf(box, { newBalance, alreadyOpened: false });
  });
}
