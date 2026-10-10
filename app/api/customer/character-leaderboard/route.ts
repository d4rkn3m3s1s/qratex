import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { cachedJson } from '@/lib/redis';
import { defineRoute } from '@/lib/http/define-route';
import { BADGE_CATALOG } from '@/lib/badge-catalog';
import { resolveBadgeThumb } from '@/lib/badge-images';
import { getCharacterTier } from '@/lib/character-reveal-texts';
import { CATEGORY_BY_CHARACTER } from '@/lib/character-categories';
import { CHARACTER_BADGE_IDS } from '@/lib/badges/customer-collection';
import {
  competitionRank,
  holdersPercent,
  maskDisplayName,
  normalizeCollectionRarity,
} from '@/lib/badges/collection-logic';
import { nextIstanbulWeekStart } from '@/components/ds/play/istanbul-time';

export const dynamic = 'force-dynamic';

const CATALOG_BY_ID = new Map(BADGE_CATALOG.map((b) => [b.id, b]));
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_N = 20;

function categoryOf(badgeId: string) {
  const c = CATEGORY_BY_CHARACTER[badgeId];
  return c ? { key: c.key, name: c.name, emoji: c.emoji, accent: c.accent } : null;
}

/** Karakter kademesi PUANDAN türer (reveal ile aynı kaynak); yoksa katalog. */
function rarityOf(badgeId: string) {
  return normalizeCollectionRarity(getCharacterTier(badgeId) ?? CATALOG_BY_ID.get(badgeId)?.rarity);
}

type RarestGlobal = { holdersByBadge: Array<[string, number]>; totalCustomers: number };

/**
 * GET /api/customer/character-leaderboard?mode=rarest|top-weekly (yalnız CUSTOMER)
 *
 *  - `rarest`: en az kullanıcıda olan karakterler. Global kısım (sahip sayıları) herkes için
 *    aynı → Redis 10 dk; yalnız `isMine` maskesi istek başına. Sahip olmadığın karakterin
 *    kimliği (badgeId/ad/ikon/kategori) SIZMAZ; satır anahtarı opak.
 *  - `top-weekly`: bu hafta (Europe/Istanbul Pazartesi 00:00'dan beri) en çok karakter
 *    kazananlar. Diğer kullanıcıların `userId`'si ve avatarı DÖNMEZ; ad maskelenir
 *    ("Furkan U."). Kullanıcının kendi sırası ilk 20 dışında da GERÇEK hesaplanır.
 */
export const GET = defineRoute(
  {
    name: 'customer.character-leaderboard',
    roles: ['CUSTOMER'],
    query: z.object({ mode: z.enum(['rarest', 'top-weekly']).default('rarest') }),
    rateLimit: 'read',
  },
  async ({ query, user }) => {
    const userId = user.id;

    if (query.mode === 'top-weekly') {
      const now = new Date();
      const weekStart = new Date(nextIstanbulWeekStart(now).getTime() - WEEK_MS);

      const grouped = await prisma.userBadge.groupBy({
        by: ['userId'],
        where: { badgeId: { in: [...CHARACTER_BADGE_IDS] }, earnedAt: { gte: weekStart } },
        _count: { _all: true },
      });
      const allCounts = grouped.map((g) => g._count._all);
      const sorted = [...grouped]
        .sort((a, b) => b._count._all - a._count._all || a.userId.localeCompare(b.userId))
        .slice(0, TOP_N);

      const users = sorted.length
        ? await prisma.user.findMany({ where: { id: { in: sorted.map((g) => g.userId) } }, select: { id: true, name: true } })
        : [];
      const nameById = new Map(users.map((u) => [u.id, u.name]));

      const rows = sorted.map((g, i) => {
        const count = g._count._all;
        const isCurrentUser = g.userId === userId;
        return {
          rank: competitionRank(count, allCounts) ?? 0,
          // Opak anahtar: diğer kullanıcıların kimliğinden hiçbir parça istemciye gitmez.
          rowKey: isCurrentUser ? 'me' : `w-${i}`,
          name: maskDisplayName(nameById.get(g.userId)),
          count,
          isCurrentUser,
        };
      });

      const mine = grouped.find((g) => g.userId === userId)?._count._all ?? 0;
      return {
        mode: 'top-weekly' as const,
        weekStart: weekStart.toISOString(),
        participants: grouped.length,
        leaderboard: rows,
        currentUser: { count: mine, rank: competitionRank(mine, allCounts) },
      };
    }

    const [global, myBadges] = await Promise.all([
      cachedJson<RarestGlobal>('badges:character-rarest:v1', 10 * 60, async () => {
        const [grouped, totalCustomers] = await Promise.all([
          prisma.userBadge.groupBy({
            by: ['badgeId'],
            where: { badgeId: { in: [...CHARACTER_BADGE_IDS] } },
            _count: { _all: true },
          }),
          prisma.user.count({ where: { role: 'CUSTOMER' } }),
        ]);
        return {
          holdersByBadge: grouped.map((g) => [g.badgeId, g._count._all] as [string, number]),
          totalCustomers,
        };
      }),
      prisma.userBadge.findMany({ where: { userId, badgeId: { in: [...CHARACTER_BADGE_IDS] } }, select: { badgeId: true } }),
    ]);
    const mineSet = new Set(myBadges.map((b) => b.badgeId));

    const sorted = global.holdersByBadge
      .filter(([, holders]) => holders > 0)
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'tr'));

    const leaderboard = sorted.map(([badgeId, holders], i) => {
      const isMine = mineSet.has(badgeId);
      const cat = CATALOG_BY_ID.get(badgeId);
      return {
        rowKey: isMine ? badgeId : `rare-${i}`,
        badgeId: isMine ? badgeId : null,
        name: isMine ? cat?.name ?? null : null,
        thumb: isMine ? resolveBadgeThumb(cat?.icon ?? null) : null,
        category: isMine ? categoryOf(badgeId) : null,
        rarity: rarityOf(badgeId),
        holders,
        holdersPct: holdersPercent(holders, global.totalCustomers),
        isMine,
      };
    });

    return { mode: 'rarest' as const, totalCustomers: global.totalCustomers, leaderboard };
  },
);
