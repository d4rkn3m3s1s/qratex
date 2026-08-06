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
import { CATEGORY_BY_CHARACTER } from '@/lib/character-categories';

export const dynamic = 'force-dynamic';

/** Bir karakter badgeId'sinin kategorisini (varsa) sadeleştirir (UI teması için). */
function categoryOf(badgeId: string) {
  const c = CATEGORY_BY_CHARACTER[badgeId];
  return c ? { key: c.key, name: c.name, emoji: c.emoji, accent: c.accent, description: c.description } : null;
}

/**
 * GET: kullanıcının KAZANDIĞI karakter rozetleri + GİZLİ ilerleme barı.
 *  • collection: kazanılan karakter rozetleri (kategorileriyle). Kilitli/diğer
 *    rozetler DÖNMEZ — kullanıcı sadece kazandıklarını görür.
 *  • bar: en dolu kategorinin ilerlemesi (0..1) + kaç yorum kaldığı. Kategori ADI
 *    GİZLİDİR — istemciye gönderilmez (kullanıcı hangi kategoriyi doldurduğunu bilmez).
 *  • ready: eşik dolu → sihirli reveal açılabilir.
 */
export async function GET() {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const characterIds = CHARACTER_PROFILES.map((c) => c.badgeId);

  // Kazanılan karakter rozetleri (en yeni önce).
  const owned = await prisma.userBadge.findMany({
    where: { userId, badgeId: { in: characterIds } },
    select: { badgeId: true, earnedAt: true },
    orderBy: { earnedAt: 'desc' },
  });
  const collection = owned
    .map((o) => {
      const cat = BADGE_CATALOG.find((b) => b.id === o.badgeId);
      if (!cat) return null;
      return {
        badgeId: o.badgeId, name: cat.name, icon: cat.icon, description: cat.description,
        earnedAt: o.earnedAt, category: categoryOf(o.badgeId),
      };
    })
    .filter(Boolean);

  // Gizli ilerleme barı (kategori adı DIŞARI SIZMAZ).
  const prog = await getCategoryProgress(userId);

  return NextResponse.json(
    {
      success: true,
      // Geriye dönük: en son kazanılan karakteri "character" olarak da ver.
      character: collection[0] ?? null,
      collection,
      bar: {
        current: prog.current,
        threshold: prog.threshold,
        progress: prog.progress,
        remaining: Math.max(0, prog.threshold - prog.current),
        ready: prog.ready,
        // NOT: topCategoryKey BİLİNÇLİ olarak gönderilmiyor (gizli).
      },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/**
 * POST: "keşfet" — eşiği dolmuş bir kategoride alınmamış karakteri açar (reveal anı).
 * Hazır kategori yoksa 400. Başarılıysa karakter + kategori + why döner (reveal gösterir).
 */
export async function POST() {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

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
  return NextResponse.json(
    {
      success: true,
      character: {
        badgeId: result.badgeId, name: result.name, why: result.why,
        icon: catalog?.icon, description: catalog?.description,
        category: categoryOf(result.badgeId),
      },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
