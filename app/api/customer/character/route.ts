import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { prisma } from '@/lib/prisma';
import { CHARACTER_PROFILES, CHARACTER_BADGE_THRESHOLD, assignCharacterBadge } from '@/lib/character-badges';
import { BADGE_CATALOG } from '@/lib/badge-catalog';

export const dynamic = 'force-dynamic';

/** GET: kullanıcının mevcut karakter rozetini (varsa) döndürür. */
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

  return NextResponse.json(
    {
      success: true,
      character: owned && catalog ? { badgeId: owned.badgeId, name: catalog.name, icon: catalog.icon, description: catalog.description } : null,
      canDiscover: textCount >= CHARACTER_BADGE_THRESHOLD,
      feedbackCount: textCount,
      threshold: CHARACTER_BADGE_THRESHOLD,
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
      character: { badgeId: result.badgeId, name: result.name, why: result.why, icon: catalog?.icon, description: catalog?.description },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
