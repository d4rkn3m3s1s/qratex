import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { prisma } from '@/lib/prisma';
import {
  CHARACTER_PROFILES,
  getCategoryProgress,
  revealReadyCategoryBadge,
} from '@/lib/character-badges';
import { BADGE_CATALOG } from '@/lib/badge-catalog';
import { CATEGORY_BY_CHARACTER, CHARACTER_CATEGORIES } from '@/lib/character-categories';

export const dynamic = 'force-dynamic';

const CHAR_IDS = CHARACTER_PROFILES.map((c) => c.badgeId);

/** Bir karakter badgeId'sinin kategorisini (varsa) sadeleştirir (UI teması için). */
function categoryOf(badgeId: string) {
  const c = CATEGORY_BY_CHARACTER[badgeId];
  return c ? { key: c.key, name: c.name, emoji: c.emoji, accent: c.accent, description: c.description } : null;
}

/** Katalogdan rarity (common|rare|epic|legendary). Yoksa common. */
function rarityOf(badgeId: string): string {
  return BADGE_CATALOG.find((b) => b.id === badgeId)?.rarity ?? 'common';
}

/**
 * GET: kullanıcının KAZANDIĞI karakter rozetleri + GİZLİ ilerleme barı + kategori vitrini.
 *  • collection: kazanılan karakterler (rarity + nadir oran + kategori).
 *  • categoryStats: her kategoride KAÇ karakter toplandı (toplam sayı GİZLİ — merak).
 *  • bar: gizli ilerleme (kategori adı sızmaz).
 * Kilitli/diğer karakterler DÖNMEZ — kullanıcı sadece kazandıklarını görür.
 */
export async function GET() {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  // Kazanılan karakter rozetleri (en yeni önce).
  const owned = await prisma.userBadge.findMany({
    where: { userId, badgeId: { in: CHAR_IDS } },
    select: { badgeId: true, earnedAt: true },
    orderBy: { earnedAt: 'desc' },
  });
  const ownedIds = owned.map((o) => o.badgeId);

  // Nadir oran: her kazanılan rozet kaç kullanıcıda var (+ toplam customer sayısı).
  const [badgeCounts, totalCustomers] = await Promise.all([
    ownedIds.length
      ? prisma.userBadge.groupBy({ by: ['badgeId'], where: { badgeId: { in: ownedIds } }, _count: { _all: true } })
      : Promise.resolve([] as { badgeId: string; _count: { _all: number } }[]),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
  ]);
  const countByBadge = new Map(badgeCounts.map((b) => [b.badgeId, b._count._all]));

  const collection = owned
    .map((o) => {
      const cat = BADGE_CATALOG.find((b) => b.id === o.badgeId);
      if (!cat) return null;
      const holders = countByBadge.get(o.badgeId) ?? 1;
      const ratePct = totalCustomers > 0 ? Math.round((holders / totalCustomers) * 1000) / 10 : null;
      return {
        badgeId: o.badgeId, name: cat.name, icon: cat.icon, description: cat.description,
        earnedAt: o.earnedAt, category: categoryOf(o.badgeId),
        rarity: rarityOf(o.badgeId),
        holders, ratePct, // "bu rozet kullanıcıların %X'inde"
      };
    })
    .filter(Boolean);

  // Kategori vitrini: SÜRPRİZ KORUMASI — kategoriler müşteriye ÖNDEN gösterilmez.
  // Yalnızca kullanıcının EN AZ BİR karakter KAZANDIĞI kategoriler döner (kazandıkça
  // öğrenilir). Hiç kazanılmamış kategorilerin adı/emoji'si SIZMAZ. total da gizli.
  const ownedSet = new Set(ownedIds);
  const categoryStats = CHARACTER_CATEGORIES
    .map((c) => ({
      key: c.key, name: c.name, emoji: c.emoji, accent: c.accent,
      collected: c.characterIds.filter((id) => ownedSet.has(id)).length,
    }))
    .filter((c) => c.collected > 0); // kazanılmamış kategori gösterilmez (kategori listesi gizli)

  // Kullanıcının profilinde seçtiği "ana karakter" (varsa).
  const featuredBadgeId = await prisma.user
    .findUnique({ where: { id: userId }, select: { featuredCharacterBadgeId: true } })
    .then((u) => u?.featuredCharacterBadgeId ?? null)
    .catch(() => null);

  // Gizli ilerleme barı (kategori adı DIŞARI SIZMAZ).
  const prog = await getCategoryProgress(userId);

  return NextResponse.json(
    {
      success: true,
      character: collection[0] ?? null, // geriye dönük: en son kazanılan
      collection,
      categoryStats,
      featuredBadgeId,
      bar: {
        current: prog.current,
        threshold: prog.threshold,
        progress: prog.progress,
        remaining: Math.max(0, prog.threshold - prog.current),
        ready: prog.ready,
      },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/**
 * POST: iki mod —
 *  1) body {action:'feature', badgeId} → profil "ana karakter"ini ayarla (sahip olunan rozet).
 *  2) (varsayılan) "keşfet" — eşiği dolmuş kategoride alınmamış karakteri açar (reveal).
 */
export async function POST(req: Request) {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const body = await req.json().catch(() => ({} as { action?: string; badgeId?: string }));

  // ── Ana karakter seçimi ──
  if (body?.action === 'feature') {
    const badgeId = String(body.badgeId ?? '');
    // Yalnızca SAHİP OLUNAN bir karakter rozeti ana yapılabilir.
    const owns = await prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId } }, select: { id: true },
    }).catch(() => null);
    if (!owns || !CHAR_IDS.includes(badgeId)) {
      return NextResponse.json({ success: false, error: 'Bu rozet sende yok.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    await prisma.user.update({ where: { id: userId }, data: { featuredCharacterBadgeId: badgeId } });
    return NextResponse.json({ success: true, featuredBadgeId: badgeId }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  // ── Reveal (varsayılan) ──
  const prog = await getCategoryProgress(userId);
  if (!prog.ready) {
    return NextResponse.json(
      { success: false, error: 'Henüz keşfe hazır değilsin, biraz daha yorum yaz.', bar: { current: prog.current, threshold: prog.threshold } },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const result = await revealReadyCategoryBadge(userId);
  if (!result) {
    return NextResponse.json(
      { success: false, error: 'Şu an açılamadı, birazdan tekrar dene.' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const catalog = BADGE_CATALOG.find((b) => b.id === result.badgeId);
  // Nadir oran (reveal görkemi için).
  const [holders, totalCustomers] = await Promise.all([
    prisma.userBadge.count({ where: { badgeId: result.badgeId } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
  ]);
  const ratePct = totalCustomers > 0 ? Math.round((holders / totalCustomers) * 1000) / 10 : null;

  return NextResponse.json(
    {
      success: true,
      character: {
        badgeId: result.badgeId, name: result.name, why: result.why,
        icon: catalog?.icon, description: catalog?.description,
        category: categoryOf(result.badgeId),
        rarity: rarityOf(result.badgeId),
        holders, ratePct,
      },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
