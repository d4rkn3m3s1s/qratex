import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { prisma } from '@/lib/prisma';
import { CHARACTER_PROFILES, CATEGORY_BADGE_THRESHOLD } from '@/lib/character-badges';
import { CHARACTER_CATEGORIES } from '@/lib/character-categories';

export const dynamic = 'force-dynamic';

/**
 * ADMIN-ONLY karakter rozeti TEST aracı. Sadece geliştirme/demo içindir:
 * bir kullanıcının karakter rozetlerini sıfırlar ve/veya yorumlarını belirli bir
 * kategoriye atayarak barı istenen doluluğa getirir — böylece reveal akışı
 * tekrar tekrar test edilebilir (canlı DB değişikliği yapar).
 *
 * GET  ?userId=me|<id>            → mevcut durum (kategori sayıları + karakter rozetleri).
 * POST { userId?, action, ... }   → aksiyon uygula.
 *   action:'reset'                → tüm karakter rozetlerini sil (reveal tekrar hazır).
 *   action:'fill', category, n    → kullanıcının n yorumunu <category>'ye ata (bar doldur).
 *   action:'clearCategories'      → tüm yorumların characterCategory'sini temizle.
 */

const CHAR_IDS = CHARACTER_PROFILES.map((c) => c.badgeId);

async function resolveUserId(auth: { session: { user: { id: string } } }, param: string | null): Promise<string> {
  if (!param || param === 'me') return auth.session.user.id;
  return param;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const userId = await resolveUserId(auth, req.nextUrl.searchParams.get('userId'));

  const grouped = await prisma.consumptionReview.groupBy({
    by: ['characterCategory'],
    where: { customerId: userId, characterCategory: { not: null } },
    _count: { _all: true },
  });
  const owned = await prisma.userBadge.findMany({
    where: { userId, badgeId: { in: CHAR_IDS } },
    select: { badgeId: true, earnedAt: true },
  });

  return NextResponse.json(
    {
      success: true,
      userId,
      threshold: CATEGORY_BADGE_THRESHOLD,
      categoryCounts: grouped.map((g) => ({ category: g.characterCategory, count: g._count._all })),
      characterBadges: owned,
      categories: CHARACTER_CATEGORIES.map((c) => ({ key: c.key, name: c.name })),
    },
    { headers: PRIVATE_NO_STORE_HEADERS },
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const userId = await resolveUserId(auth, body.userId ?? null);
  const action = String(body.action ?? '');

  if (action === 'reset') {
    const del = await prisma.userBadge.deleteMany({ where: { userId, badgeId: { in: CHAR_IDS } } });
    return NextResponse.json({ success: true, action, deleted: del.count }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'clearCategories') {
    const upd = await prisma.consumptionReview.updateMany({ where: { customerId: userId }, data: { characterCategory: null } });
    return NextResponse.json({ success: true, action, cleared: upd.count }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'fill') {
    const category = String(body.category ?? '');
    const valid = CHARACTER_CATEGORIES.some((c) => c.key === category);
    if (!valid) {
      return NextResponse.json({ success: false, error: 'Geçersiz kategori' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    // Kaç yorum bu kategoriye atansın (varsayılan: eşik = bar tam dolu).
    const n = Math.max(1, Math.min(50, Number(body.n) || CATEGORY_BADGE_THRESHOLD));
    const fbs = await prisma.consumptionReview.findMany({
      where: { customerId: userId, text: { not: null } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: n,
    });
    for (const f of fbs) {
      await prisma.consumptionReview.update({ where: { id: f.id }, data: { characterCategory: category } }).catch(() => {});
    }
    return NextResponse.json({ success: true, action, category, filled: fbs.length, threshold: CATEGORY_BADGE_THRESHOLD }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  return NextResponse.json({ success: false, error: 'Bilinmeyen aksiyon' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
}
