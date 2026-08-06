import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { prisma } from '@/lib/prisma';
import { CHARACTER_PROFILES, CHARACTER_BADGE_THRESHOLD, assignCharacterBadge } from '@/lib/character-badges';
import { BADGE_CATALOG } from '@/lib/badge-catalog';
import { CATEGORY_BY_CHARACTER } from '@/lib/character-categories';

export const dynamic = 'force-dynamic';

/** Bir karakter badgeId'sinin kategorisini (varsa) sadeleştirip döndürür. */
function categoryOf(badgeId: string) {
  const c = CATEGORY_BY_CHARACTER[badgeId];
  return c ? { key: c.key, name: c.name, emoji: c.emoji, accent: c.accent, description: c.description } : null;
}

/**
 * GET: kullanıcının mevcut karakter rozeti (varsa) + ilerleme bar verisi.
 * Bar: bir sonraki "keşif" için kaç yorum kaldığını gösterir (eşik tabanlı).
 */
export async function GET() {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const characterIds = CHARACTER_PROFILES.map((c) => c.badgeId);
  const owned = await prisma.userBadge.findFirst({
    where: { userId, badgeId: { in: characterIds } },
    select: { badgeId: true, earnedAt: true },
    orderBy: { earnedAt: 'desc' },
  });

  const textCount = await prisma.feedback.count({ where: { userId, deletedAt: null, text: { not: null } } });
  const catalog = owned ? BADGE_CATALOG.find((b) => b.id === owned.badgeId) : null;

  // İlerleme barı: 0..1 ve "kalan yorum" — eşiğe kadar dolan çubuk için.
  const remaining = Math.max(0, CHARACTER_BADGE_THRESHOLD - textCount);
  const progress = Math.min(1, textCount / CHARACTER_BADGE_THRESHOLD);

  return NextResponse.json(
    {
      success: true,
      character: owned && catalog
        ? {
            badgeId: owned.badgeId, name: catalog.name, icon: catalog.icon,
            description: catalog.description, earnedAt: owned.earnedAt,
            category: categoryOf(owned.badgeId),
          }
        : null,
      canDiscover: textCount >= CHARACTER_BADGE_THRESHOLD,
      feedbackCount: textCount,
      threshold: CHARACTER_BADGE_THRESHOLD,
      remaining,
      progress,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/** POST: "karakterimi keşfet" — kullanıcı isteğiyle sınıflandırmayı tetikler. */
export async function POST() {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const textCount = await prisma.feedback.count({ where: { userId, deletedAt: null, text: { not: null } } });
  if (textCount < CHARACTER_BADGE_THRESHOLD) {
    return NextResponse.json(
      { success: false, error: `En az ${CHARACTER_BADGE_THRESHOLD} yorum gerekiyor.`, feedbackCount: textCount, threshold: CHARACTER_BADGE_THRESHOLD },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const result = await assignCharacterBadge(userId);
  if (!result) {
    return NextResponse.json(
      { success: false, error: 'Karakter analizi şu an yapılamadı, sonra tekrar deneyin.' },
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
