/**
 * Cüzdan → Ödüller / Ödüllerim okuma katmanı (sunucu bileşeni ve GET uçları ortak).
 * Hepsi kullanıcı kapsamlı (`userId` her `where`'de); yanıt yalnız `types.ts` DTO'larıdır.
 * GET yan etkisiz: günlük kutu burada ÜRETİLMEZ (bkz. mutations.ensureDailyBox).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveRewardDisplayImage } from '@/lib/reward-display-image';
import { describeRemedyOffer } from '@/lib/remedy-offer-service';
import { publicDisplayName } from '@/lib/http/dto';
import { istanbulDayKey } from '@/lib/quests/period';
import { nextIstanbulMidnight } from '@/components/ds/play/istanbul-time';
import {
  COSMETIC_PIN_LIMIT,
  NEW_REWARD_WINDOW_MS,
  RARITY_RANK,
  boxSource,
  boxTier,
  cosmeticRarity,
  cosmeticType,
  deriveRewardState,
  parseRewardRules,
  pickNextGoal,
  remedyReference,
  rewardKind,
  splitRewardIcon,
  stockInfo,
} from './rules';
import type {
  BoxTeaserDTO,
  CosmeticDTO,
  CosmeticsCatalogDTO,
  DailyBoxDTO,
  OpenedBoxDTO,
  OwnedWalletDTO,
  Page,
  RemedyPassDTO,
  RewardDTO,
  RewardPassDTO,
  RewardsCatalogDTO,
} from './types';

type Db = typeof prisma;

export const CATALOG_LIMIT = 200;
export const COSMETICS_LIMIT = 150;
export const ACTIVE_PASS_LIMIT = 100;
export const HISTORY_PAGE_SIZE = 20;
export const UNOPENED_BOX_LIMIT = 60;
export const REMEDY_PASS_LIMIT = 50;

const REWARD_SELECT = {
  id: true,
  name: true,
  description: true,
  icon: true,
  cost: true,
  type: true,
  stock: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.RewardSelect;

type RewardRow = Prisma.RewardGetPayload<{ select: typeof REWARD_SELECT }>;

export function toRewardDTO(row: RewardRow, ctx: { balance: number; claimCount: number; now: Date }): RewardDTO {
  const rules = parseRewardRules(row.metadata);
  const { imageUrl: iconImage, glyph } = splitRewardIcon(row.icon);
  const imageUrl = resolveRewardDisplayImage({ id: row.id, icon: iconImage }) ?? null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    glyph: imageUrl ? null : glyph,
    imageUrl,
    cost: row.cost,
    kind: rewardKind(row.type),
    state: deriveRewardState({
      cost: row.cost,
      stock: row.stock,
      rules,
      balance: ctx.balance,
      userClaimCount: ctx.claimCount,
      now: ctx.now,
    }),
    stock: stockInfo(row.stock),
    validFrom: rules.validFrom?.toISOString() ?? null,
    validUntil: rules.validUntil?.toISOString() ?? null,
    perUserLimit: rules.perUserLimit,
    userClaimCount: ctx.claimCount,
    isNew: ctx.now.getTime() - row.createdAt.getTime() <= NEW_REWARD_WINDOW_MS,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Bakiye + müşteri DTO'lu katalog. Kişi başı alım sayıları tek `groupBy` (N+1 yok). */
export async function loadRewardsCatalog(userId: string, opts: { now?: Date; db?: Db } = {}): Promise<RewardsCatalogDTO> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const [user, rows] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { points: true } }),
    db.reward.findMany({
      where: { isActive: true, archivedAt: null },
      select: REWARD_SELECT,
      orderBy: [{ cost: 'asc' }, { createdAt: 'desc' }],
      take: CATALOG_LIMIT + 1,
    }),
  ]);
  const balance = user?.points ?? 0;
  const truncated = rows.length > CATALOG_LIMIT;
  const list = truncated ? rows.slice(0, CATALOG_LIMIT) : rows;
  const counts = new Map<string, number>();
  if (list.length > 0) {
    const grouped = await db.userReward.groupBy({
      by: ['rewardId'],
      where: { userId, rewardId: { in: list.map((r) => r.id) } },
      _count: { _all: true },
    });
    for (const g of grouped) counts.set(g.rewardId, g._count._all);
  }
  const rewards = list.map((row) => toRewardDTO(row, { balance, claimCount: counts.get(row.id) ?? 0, now }));
  return { balance, rewards, nextGoalId: pickNextGoal(rewards), truncated };
}

/** Kozmetik katalog: nadirlik KADEMESİNE göre (alfabetik değil), sahiplik/kuşanma/vitrin. */
export async function loadCosmeticsCatalog(userId: string, opts: { db?: Db } = {}): Promise<CosmeticsCatalogDTO> {
  const db = opts.db ?? prisma;
  const [user, items, owned, pinnedBadges] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { image: true, name: true, customFrameColor: true } }),
    db.cosmeticItem.findMany({
      where: { isActive: true, archivedAt: null },
      select: { id: true, name: true, description: true, type: true, price: true, rarity: true, imageUrl: true, createdAt: true },
      orderBy: [{ price: 'desc' }, { createdAt: 'desc' }],
      take: COSMETICS_LIMIT,
    }),
    db.userCosmetic.findMany({
      where: { userId },
      select: {
        cosmeticId: true,
        isEquipped: true,
        isPinned: true,
        giftMessage: true,
        giftedByUser: { select: { name: true } },
      },
      take: 500,
    }),
    db.userBadge.count({ where: { userId, isPinned: true } }),
  ]);
  const byId = new Map(owned.map((o) => [o.cosmeticId, o]));
  const dto: CosmeticDTO[] = items.map((it) => {
    const own = byId.get(it.id);
    const rarity = cosmeticRarity(it.rarity);
    return {
      id: it.id,
      name: it.name,
      description: it.description,
      type: cosmeticType(it.type),
      price: it.price,
      rarity,
      rarityRank: RARITY_RANK[rarity],
      asset: it.imageUrl,
      owned: !!own,
      equipped: !!own?.isEquipped,
      pinned: !!own?.isPinned,
      giftedBy: own?.giftedByUser ? publicDisplayName(own.giftedByUser.name, 'Bir arkadaşın') : null,
      giftMessage: own?.giftMessage ?? null,
      createdAt: it.createdAt.toISOString(),
    };
  });
  dto.sort((a, b) => b.rarityRank - a.rarityRank || b.price - a.price || a.name.localeCompare(b.name, 'tr'));
  const pinnedCosmetics = owned.filter((o) => o.isPinned).length;
  return {
    items: dto,
    pinsUsed: pinnedCosmetics + pinnedBadges,
    pinLimit: COSMETIC_PIN_LIMIT,
    preview: { image: user?.image ?? null, name: user?.name ?? null, frameColor: user?.customFrameColor ?? null },
  };
}

// ───────────────────────── Ödüllerim ─────────────────────────

const PASS_SELECT = {
  id: true,
  code: true,
  redeemedAt: true,
  claimedAt: true,
  reward: { select: { id: true, name: true, description: true, icon: true, type: true } },
} satisfies Prisma.UserRewardSelect;

type PassRow = Prisma.UserRewardGetPayload<{ select: typeof PASS_SELECT }>;

export function toRewardPassDTO(row: PassRow): RewardPassDTO {
  const { imageUrl: iconImage, glyph } = splitRewardIcon(row.reward.icon);
  const imageUrl = resolveRewardDisplayImage({ id: row.reward.id, icon: iconImage }) ?? null;
  return {
    kind: 'reward',
    id: row.id,
    code: row.code,
    rewardName: row.reward.name,
    rewardKind: rewardKind(row.reward.type),
    glyph: imageUrl ? null : glyph,
    imageUrl,
    description: row.reward.description,
    issuedAt: row.redeemedAt.toISOString(),
    usedAt: row.claimedAt?.toISOString() ?? null,
  };
}

const BOX_SELECT = {
  id: true,
  title: true,
  message: true,
  points: true,
  couponCode: true,
  dayKey: true,
  openedAt: true,
  createdAt: true,
} satisfies Prisma.UserSurpriseBoxSelect;

type BoxRow = Prisma.UserSurpriseBoxGetPayload<{ select: typeof BOX_SELECT }>;

/** Açılmamış kutu: içerik (puan, kupon, mesaj) SIZMAZ — yalnız kademe ve kaynak. */
export function toBoxTeaser(row: BoxRow): BoxTeaserDTO {
  return {
    id: row.id,
    title: row.title,
    source: boxSource(row),
    tier: boxTier(row),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toOpenedBox(row: BoxRow): OpenedBoxDTO {
  return {
    kind: 'box',
    id: row.id,
    title: row.title,
    message: row.message,
    source: boxSource(row),
    tier: boxTier(row),
    points: row.points,
    couponCode: row.couponCode,
    openedAt: (row.openedAt ?? row.createdAt).toISOString(),
  };
}

function pageOf<T extends { id: string }>(rows: T[], size: number): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > size;
  const items = hasMore ? rows.slice(0, size) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/** Açılmış kutular — en yeniden eskiye, cursor sayfalamalı (eski `take: 100 + ASC` hatası yok). */
export async function listOpenedBoxes(userId: string, cursor: string | null, opts: { db?: Db; size?: number } = {}): Promise<Page<OpenedBoxDTO>> {
  const db = opts.db ?? prisma;
  const size = opts.size ?? HISTORY_PAGE_SIZE;
  const rows = await db.userSurpriseBox.findMany({
    where: { userId, openedAt: { not: null } },
    select: BOX_SELECT,
    orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
    take: size + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = pageOf(rows, size);
  return { items: page.items.map(toOpenedBox), nextCursor: page.nextCursor };
}

/** Kullanılmış ödül kodları — en yeniden eskiye, cursor sayfalamalı. */
export async function listUsedPasses(userId: string, cursor: string | null, opts: { db?: Db; size?: number } = {}): Promise<Page<RewardPassDTO>> {
  const db = opts.db ?? prisma;
  const size = opts.size ?? HISTORY_PAGE_SIZE;
  const rows = await db.userReward.findMany({
    where: { userId, claimedAt: { not: null } },
    select: PASS_SELECT,
    orderBy: [{ claimedAt: 'desc' }, { id: 'desc' }],
    take: size + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = pageOf(rows, size);
  return { items: page.items.map(toRewardPassDTO), nextCursor: page.nextCursor };
}

const REMEDY_COUPON_TYPES = ['discount', 'free_item'] as const;

/** Kabul edilmiş, kasada gösterilecek telafi (indirim / ücretsiz ürün). Puan türü Seslerim'dedir. */
export async function listRemedyPasses(userId: string, opts: { db?: Db } = {}): Promise<RemedyPassDTO[]> {
  const db = opts.db ?? prisma;
  const offers = await db.remedyOffer.findMany({
    where: { userId, status: 'accepted', selectedType: { in: [...REMEDY_COUPON_TYPES] } },
    select: {
      id: true,
      message: true,
      options: true,
      selectedType: true,
      selectedValue: true,
      acceptedAt: true,
      dealer: { select: { name: true, businessName: true } },
    },
    orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
    take: REMEDY_PASS_LIMIT,
  });
  const out: RemedyPassDTO[] = [];
  for (const o of offers) {
    const { selectionLabel } = describeRemedyOffer(o);
    if (o.selectedType !== 'discount' && o.selectedType !== 'free_item') continue;
    out.push({
      kind: 'remedy',
      id: o.id,
      reference: remedyReference(o.id),
      businessName: o.dealer?.businessName || o.dealer?.name || 'İşletme',
      label: selectionLabel ?? `${o.selectedType === 'discount' ? '%' : ''}${o.selectedValue ?? ''}`,
      selectionType: o.selectedType,
      message: o.message,
      acceptedAt: o.acceptedAt?.toISOString() ?? null,
    });
  }
  return out;
}

export async function loadDailyBox(userId: string, now: Date, db: Db = prisma): Promise<DailyBoxDTO> {
  const dayKey = istanbulDayKey(now);
  const box = await db.userSurpriseBox.findUnique({
    where: { userId_dayKey: { userId, dayKey } },
    select: { id: true, openedAt: true },
  });
  return {
    dayKey,
    boxId: box?.id ?? null,
    opened: !!box?.openedAt,
    nextAt: nextIstanbulMidnight(now).toISOString(),
  };
}

/** Ödüllerim'in ilk ekranı: hazır pass'ler + telafi kuponları + kutular. */
export async function loadOwnedWallet(
  userId: string,
  opts: { now?: Date; db?: Db; boxesEnabled?: boolean } = {}
): Promise<OwnedWalletDTO> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const boxesEnabled = opts.boxesEnabled !== false;

  const [passRows, usedPasses, remedyPasses, unopenedRows, opened, daily] = await Promise.all([
    db.userReward.findMany({
      where: { userId, claimedAt: null },
      select: PASS_SELECT,
      orderBy: [{ redeemedAt: 'desc' }, { id: 'desc' }],
      take: ACTIVE_PASS_LIMIT,
    }),
    listUsedPasses(userId, null, { db }),
    listRemedyPasses(userId, { db }),
    boxesEnabled
      ? db.userSurpriseBox.findMany({
          where: { userId, openedAt: null, withdrawnAt: null },
          select: BOX_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: UNOPENED_BOX_LIMIT,
        })
      : Promise.resolve([] as BoxRow[]),
    boxesEnabled ? listOpenedBoxes(userId, null, { db }) : Promise.resolve({ items: [], nextCursor: null } as Page<OpenedBoxDTO>),
    boxesEnabled ? loadDailyBox(userId, now, db) : Promise.resolve(null),
  ]);

  return {
    passes: passRows.map(toRewardPassDTO),
    remedyPasses,
    usedPasses,
    boxes: {
      enabled: boxesEnabled,
      daily,
      // Bugünün açılmamış günlük kutusu "Bugünün kutusu" kartında; listede tekrarlanmaz.
      unopened: unopenedRows.filter((r) => !(daily && r.id === daily.boxId)).map(toBoxTeaser),
      opened,
    },
  };
}
