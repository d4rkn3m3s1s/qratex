/**
 * Müşteri rozet koleksiyonu — sunucu veri yükleyici (yüzey: `/customer/me/badges`).
 *
 * Tek turda (paralel) okur, hiçbir şey YAZMAZ:
 *  1. Kullanıcının rozetleri (normal + karakter) — `UserBadge` + `Badge` alanları.
 *  2. Rozet başına sahip sayısı + müşteri tabanı → Redis'te 15 dk (herkes için aynı).
 *  3. Rozetlerden gerçekten yatan puan: `points_credited` (category `badge`) olayları.
 *  4. Ana karakter, vitrindeki kozmetik sayısı, gizli karakter barı, yorum sayısı.
 *
 * Kurallar: TAM SÜRPRİZ (kazanılmamış rozet adı/ikonu/sayısı dönmez), hata yutulmaz
 * (çağıran `QueryState` ile gösterir; "200 + sıfırlar" yok), zaman Europe/Istanbul.
 */
import { prisma } from '@/lib/prisma';
import { cachedJson } from '@/lib/redis';
import { sanitizeHexColor } from '@/lib/badge-colors';
import { resolveBadgeThumb } from '@/lib/badge-images';
import { badgeRewardPoints } from '@/lib/badge-reward-points';
import { getEmojiBadgeText } from '@/lib/emoji-badge-texts';
import { getCharacterRevealText, getCharacterTier } from '@/lib/character-reveal-texts';
import { BADGE_CATALOG } from '@/lib/badge-catalog';
import { CHARACTER_PROFILES, getCategoryProgress } from '@/lib/character-badges';
import { CATEGORY_BY_CHARACTER, CHARACTER_CATEGORIES } from '@/lib/character-categories';
import { ACTIVITY_BADGE_THRESHOLDS } from '@/lib/activity-badges';
import {
  buildStats,
  computeNextSurprise,
  creditedPointsByBadge,
  holdersPercent,
  isNewlyEarned,
  normalizeBadgeCategory,
  normalizeCollectionRarity,
  sortCollection,
  type CharacterCategoryStat,
  type CollectionItem,
  type CollectionOverview,
} from './collection-logic';

export const CHARACTER_BADGE_IDS: readonly string[] = CHARACTER_PROFILES.map((c) => c.badgeId);
const CHARACTER_ID_SET = new Set(CHARACTER_BADGE_IDS);
const CATALOG_BY_ID = new Map(BADGE_CATALOG.map((b) => [b.id, b]));

/** Yorum-sayısı kilometre taşları (lib/activity-badges ile aynı eşikler). */
export const REVIEW_MILESTONES: ReadonlyArray<{ badgeId: string; at: number }> = [
  { badgeId: 'badge-yeni-ses', at: 1 },
  { badgeId: 'badge-usta-yorumcu', at: ACTIVITY_BADGE_THRESHOLDS.ustaYorumcu },
  { badgeId: 'badge-efsane', at: ACTIVITY_BADGE_THRESHOLDS.efsane },
  { badgeId: 'badge-taht-sahibi', at: ACTIVITY_BADGE_THRESHOLDS.tahtSahibi },
];

const HOLDERS_CACHE_KEY = 'badges:holders:v1';
const HOLDERS_TTL_SECONDS = 15 * 60;

export interface GlobalBadgeCounts {
  counts: Record<string, number>;
  totalCustomers: number;
}

/** Rozet başına sahip sayısı + müşteri tabanı (herkes için aynı → paylaşılan önbellek). */
export async function getGlobalBadgeCounts(): Promise<GlobalBadgeCounts> {
  return cachedJson<GlobalBadgeCounts>(HOLDERS_CACHE_KEY, HOLDERS_TTL_SECONDS, async () => {
    const [grouped, totalCustomers] = await Promise.all([
      prisma.userBadge.groupBy({ by: ['badgeId'], _count: { _all: true } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
    ]);
    const counts: Record<string, number> = {};
    for (const g of grouped) counts[g.badgeId] = g._count._all;
    return { counts, totalCustomers };
  });
}

function characterCategoryRef(badgeId: string) {
  const c = CATEGORY_BY_CHARACTER[badgeId];
  return c ? { key: c.key, name: c.name, emoji: c.emoji, accent: c.accent } : null;
}

export async function loadCustomerBadgeCollection(userId: string, now: Date = new Date()): Promise<CollectionOverview> {
  const [owned, global, creditEvents, user, pinnedCosmetics, bar, feedbackCount, reviewCount] = await Promise.all([
    prisma.userBadge.findMany({
      where: { userId },
      select: {
        badgeId: true,
        earnedAt: true,
        isPinned: true,
        badge: {
          select: {
            name: true,
            description: true,
            icon: true,
            category: true,
            rarity: true,
            color: true,
            hiddenUntilEarned: true,
          },
        },
      },
      orderBy: { earnedAt: 'desc' },
      take: 1000,
    }),
    getGlobalBadgeCounts(),
    prisma.analyticsEvent.findMany({
      where: { userId, event: 'points_credited', category: 'badge' },
      select: { data: true },
      take: 2000,
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { featuredCharacterBadgeId: true } }),
    prisma.userCosmetic.count({ where: { userId, isPinned: true } }),
    getCategoryProgress(userId),
    prisma.feedback.count({ where: { userId, deletedAt: null } }),
    prisma.consumptionReview.count({ where: { customerId: userId } }),
  ]);

  const ownedIds = owned.map((o) => o.badgeId);
  const ownedSet = new Set(ownedIds);

  const [undiscovered, activeMilestones] = await Promise.all([
    prisma.badge.findFirst({
      where: { isActive: true, archivedAt: null, id: { notIn: [...CHARACTER_BADGE_IDS, ...ownedIds] } },
      select: { id: true },
    }),
    prisma.badge.findMany({
      where: { id: { in: REVIEW_MILESTONES.map((m) => m.badgeId) }, isActive: true, archivedAt: null },
      select: { id: true },
    }),
  ]);

  const credited = creditedPointsByBadge(creditEvents);

  const items: CollectionItem[] = owned.map((o) => {
    const isCharacter = CHARACTER_ID_SET.has(o.badgeId);
    const catalog = CATALOG_BY_ID.get(o.badgeId);
    // Karakterde ad/ikon katalogdan (reveal ile aynı kaynak), kademe puandan (KADEME = PUAN).
    const name = (isCharacter ? catalog?.name : undefined) ?? o.badge?.name ?? catalog?.name ?? o.badgeId;
    const description = (isCharacter ? catalog?.description : undefined) ?? o.badge?.description ?? catalog?.description ?? '';
    const icon = (isCharacter ? catalog?.icon : undefined) ?? o.badge?.icon ?? catalog?.icon ?? null;
    const rarity = isCharacter
      ? normalizeCollectionRarity(getCharacterTier(o.badgeId) ?? catalog?.rarity)
      : normalizeCollectionRarity(o.badge?.rarity ?? catalog?.rarity);
    const holders = Math.max(1, global.counts[o.badgeId] ?? 1);
    const quote = isCharacter
      ? getCharacterRevealText(o.badgeId)?.quote ?? null
      : getEmojiBadgeText(o.badgeId)?.quote ?? null;
    const charCat = isCharacter ? characterCategoryRef(o.badgeId) : null;
    return {
      id: o.badgeId,
      kind: isCharacter ? 'character' : 'badge',
      name,
      description,
      icon,
      thumb: resolveBadgeThumb(icon),
      rarity,
      category: isCharacter ? charCat?.key ?? 'dizi' : normalizeBadgeCategory(o.badge?.category ?? catalog?.category),
      characterCategory: charCat,
      color: isCharacter ? null : sanitizeHexColor(o.badge?.color),
      earnedAt: o.earnedAt.toISOString(),
      creditedPoints: credited.get(o.badgeId) ?? 0,
      catalogPoints: badgeRewardPoints(o.badgeId),
      holders,
      holdersPct: holdersPercent(holders, global.totalCustomers),
      quote,
      isPinned: o.isPinned,
      isNew: isNewlyEarned(o.earnedAt, now),
      surprise: o.badge?.hiddenUntilEarned === true,
    };
  });

  const categoryStats: CharacterCategoryStat[] = CHARACTER_CATEGORIES.map((c) => {
    const collected = c.characterIds.filter((id) => ownedSet.has(id)).length;
    return {
      key: c.key,
      name: c.name,
      emoji: c.emoji,
      accent: c.accent,
      collected,
      complete: collected > 0 && collected >= c.characterIds.length,
    };
  }).filter((c) => c.collected > 0); // kazanılmamış kategori adı sızmaz

  const featured = user?.featuredCharacterBadgeId ?? null;

  return {
    items: sortCollection(items, 'recent'),
    stats: buildStats(items, { now, pinnedCosmetics }),
    character: {
      featuredBadgeId: featured && ownedSet.has(featured) ? featured : null,
      bar: {
        current: bar.current,
        threshold: bar.threshold,
        progress: bar.progress,
        remaining: Math.max(0, bar.threshold - bar.current),
        ready: bar.ready,
      },
      categoryStats,
    },
    moreToDiscover: undiscovered !== null,
    nextSurprise: computeNextSurprise(
      feedbackCount + reviewCount,
      REVIEW_MILESTONES,
      ownedSet,
      new Set(activeMilestones.map((b) => b.id)),
    ),
    generatedAt: now.toISOString(),
  };
}
