import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const MIN_FEEDBACKS = 3; // adil sıralama için min yorum eşiği

/**
 * GET /api/customer/category-leaderboard — kategori bazlı işletme liderlik tablosu.
 * Müşteri kendi kategorisindeki en yüksek puanlı işletmeleri keşfeder (puan + yorum
 * sayısı). Bayiye rekabet/görünürlük, müşteriye keşif, platforma öneri motoru.
 *
 * ?category=cafe (yoksa: mevcut kategoriler listesi döner)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const category = new URL(request.url).searchParams.get('category')?.trim();

    // Kategori verilmediyse: aktif kategori listesini döndür (UI dropdown için).
    if (!category) {
      const cats = await prisma.user.groupBy({
        by: ['businessCategory'],
        where: { role: 'DEALER', businessCategory: { not: null } },
        _count: { _all: true },
      });
      const categories = cats
        .filter((c) => c.businessCategory)
        .map((c) => ({ category: c.businessCategory as string, dealerCount: c._count._all }))
        .sort((a, b) => b.dealerCount - a.dealerCount);
      return NextResponse.json({ categories }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Kategorideki işletmeleri ortalama puan + yorum sayısına göre sırala (son 90 gün).
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<
      Array<{ dealerId: string; businessName: string | null; name: string | null; n: bigint; avg_rating: number | null }>
    >(Prisma.sql`
      SELECT u."id" AS "dealerId", u."businessName", u."name",
             COUNT(f."id")::bigint AS n,
             AVG(f."rating")::float AS avg_rating
      FROM "User" u
      JOIN "QRCode" q ON q."dealerId" = u."id"
      JOIN "Feedback" f ON f."qrCodeId" = q."id" AND f."deletedAt" IS NULL AND f."createdAt" >= ${since}
      WHERE u."role" = 'DEALER' AND u."businessCategory" = ${category}
      GROUP BY u."id", u."businessName", u."name"
      HAVING COUNT(f."id") >= ${MIN_FEEDBACKS}
      ORDER BY avg_rating DESC, n DESC
      LIMIT 50
    `);

    const myFavorites = new Set(
      (
        await prisma.customerFavoriteDealer.findMany({
          where: { userId: session.user.id, dealerId: { in: rows.map((r) => r.dealerId) } },
          select: { dealerId: true },
        })
      ).map((f) => f.dealerId)
    );

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      dealerId: r.dealerId,
      name: r.businessName || r.name || 'İşletme',
      avgRating: r.avg_rating != null ? Number(r.avg_rating.toFixed(2)) : 0,
      feedbackCount: Number(r.n),
      isFavorite: myFavorites.has(r.dealerId),
    }));

    return NextResponse.json(
      { category, count: leaderboard.length, leaderboard },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[CATEGORY_LEADERBOARD_ERROR]', error);
    return NextResponse.json({ error: 'Liderlik tablosu alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
