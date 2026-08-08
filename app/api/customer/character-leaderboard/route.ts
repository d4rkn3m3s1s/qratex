import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { prisma } from '@/lib/prisma';
import { CHARACTER_PROFILES } from '@/lib/character-badges';
import { BADGE_CATALOG } from '@/lib/badge-catalog';
import { CATEGORY_BY_CHARACTER } from '@/lib/character-categories';

export const dynamic = 'force-dynamic';

const CHAR_IDS = CHARACTER_PROFILES.map((c) => c.badgeId);

/** Bir karakter badgeId'sinin kategorisini (varsa) sadeleştirir (UI teması için). */
function categoryOf(badgeId: string) {
  const c = CATEGORY_BY_CHARACTER[badgeId];
  return c ? { key: c.key, name: c.name, emoji: c.emoji, accent: c.accent } : null;
}

/** Katalogdan rarity (common|rare|epic|legendary). Yoksa common. */
function rarityOf(badgeId: string): string {
  return BADGE_CATALOG.find((b) => b.id === badgeId)?.rarity ?? 'common';
}

/**
 * KARAKTER LİDERLİK TABLOSU (CUSTOMER).
 *
 * İki mod (?mode=):
 *   1) rarest (varsayılan): "EN NADİR KARAKTERLER" — her karakter rozeti kaç
 *      kullanıcıda var. En az kullanıcıda olan = en nadir. Yalnızca EN AZ 1 kişide
 *      olan karakterler listelenir (hiç kimsede olmayan sızmaz).
 *   2) top-weekly: "BU HAFTA EN ÇOK KARAKTER KAZANANLAR" — son 7 günde en çok
 *      karakter rozeti kazanan kullanıcılar (ad/avatar + adet). İlk ~20 + mevcut
 *      kullanıcının bu haftaki sayısı.
 *
 * Karakter rozetleri genel listede gizlidir; bu endpoint "kazanılmış karakterler
 * arasında" nadirlik/aktivite gösterir — kilitli karakter adı sızması yoktur çünkü
 * yalnızca en az bir kişide olan karakterler görünür.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') === 'top-weekly' ? 'top-weekly' : 'rarest';

    if (mode === 'top-weekly') {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Son 7 günde kazanılan karakter rozetleri → kullanıcı başına adet.
      const grouped = await prisma.userBadge.groupBy({
        by: ['userId'],
        where: { badgeId: { in: CHAR_IDS }, earnedAt: { gte: since } },
        _count: { _all: true },
      });

      const sorted = [...grouped]
        .sort((a, b) => b._count._all - a._count._all)
        .slice(0, 20);

      const ids = sorted.map((g) => g.userId);
      const users = ids.length
        ? await prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, image: true },
          })
        : [];
      const userById = new Map(users.map((u) => [u.id, u]));

      const leaderboard = sorted.map((g, index) => {
        const u = userById.get(g.userId);
        return {
          rank: index + 1,
          userId: g.userId,
          name: u?.name ?? null,
          image: u?.image ?? null,
          count: g._count._all,
          isCurrentUser: g.userId === userId,
        };
      });

      // Mevcut kullanıcının bu haftaki karakter sayısı (listede olmasa da göster).
      const myCount = await prisma.userBadge.count({
        where: { userId, badgeId: { in: CHAR_IDS }, earnedAt: { gte: since } },
      });
      const myEntry = leaderboard.find((r) => r.isCurrentUser);
      const currentUser = {
        count: myCount,
        rank: myEntry ? myEntry.rank : null, // ilk 20 dışındaysa sıra null
      };

      return NextResponse.json(
        { success: true, mode, leaderboard, currentUser },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // ── mode === 'rarest' ──
    const [grouped, totalCustomers, myBadges] = await Promise.all([
      prisma.userBadge.groupBy({
        by: ['badgeId'],
        where: { badgeId: { in: CHAR_IDS } },
        _count: { _all: true },
      }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      // Mevcut kullanıcının sahip olduğu karakterler — SADECE onlar açık gösterilir.
      prisma.userBadge.findMany({ where: { userId, badgeId: { in: CHAR_IDS } }, select: { badgeId: true } }),
    ]);
    const mineSet = new Set(myBadges.map((b) => b.badgeId));

    // Yalnızca en az 1 kişide olan karakterler (hiç kimsede olmayan listelenmez).
    const rows = grouped
      .map((g) => {
        const cat = BADGE_CATALOG.find((b) => b.id === g.badgeId);
        const holders = g._count._all;
        const ratePct = totalCustomers > 0 ? Math.round((holders / totalCustomers) * 1000) / 10 : null;
        const isMine = mineSet.has(g.badgeId);
        return {
          // İç sıralama için gerçek badgeId (yanıttan önce maskelenir).
          _sortKey: g.badgeId,
          // Sürpriz: kullanıcının SAHİP OLMADIĞI karakterin KİMLİĞİ (badgeId dahil) istemciye
          // SIZMAZ — badge-walter-white gibi id'ler adı ele verirdi. Kendi rozetin açık.
          badgeId: isMine ? g.badgeId : null,
          name: isMine ? (cat?.name ?? g.badgeId) : null,
          icon: isMine ? (cat?.icon ?? '/logo/logo.png') : null,
          category: isMine ? categoryOf(g.badgeId) : null,
          rarity: rarityOf(g.badgeId),
          holders,
          ratePct, // "oyuncuların %X'inde"
          isMine,
        };
      })
      // En nadir (en az holder) önce; eşitlikte gerçek badgeId ile stabil (yanıtta gizli).
      .sort((a, b) => a.holders - b.holders || a._sortKey.localeCompare(b._sortKey, 'tr'));

    // İstemciye giden liste: gizli satırlar için opak, sıra-tabanlı stabil key (React key +
    // sürpriz koruması). Gerçek badgeId yalnızca isMine satırlarında kalır.
    const leaderboard = rows.map(({ _sortKey, ...r }, i) => ({
      ...r,
      rowKey: r.isMine ? _sortKey : `rare-${i}`,
    }));

    return NextResponse.json(
      { success: true, mode, totalCustomers, leaderboard },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Character leaderboard error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Karakter liderlik tablosu yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
