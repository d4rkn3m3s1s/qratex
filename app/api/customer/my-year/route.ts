import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/my-year — "QRATEX'te Yılım" kişisel etki özeti.
 * Müşterinin kilometre taşlarını ve özellikle YORUMUNUN GERÇEK ETKİSİNİ
 * ("X işletme yorumunuza aksiyon aldı / yanıtladı") tek bakışta gösterir.
 * Yeni tablo yok — mevcut Feedback/Consumption/UserBadge/User'dan toplulaştırır.
 *
 * ?period=year (varsayılan) | all
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const userId = session.user.id;

    const period = new URL(request.url).searchParams.get('period') === 'all' ? 'all' : 'year';
    const now = new Date();
    const since = period === 'all' ? new Date(0) : new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const sinceFilter = { gte: since };

    const [
      user,
      feedbackAgg,
      repliedDealerRows,
      topDealerRows,
      consumptionAgg,
      badgeCount,
      pointsEarnedRows,
      pointsSpentRows,
      streak,
      battlesWon,
    ] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { level: true, points: true, xp: true, createdAt: true } }),
      // Toplam yorum + ortalama puan (bu dönem).
      prisma.feedback.aggregate({ where: { userId, createdAt: sinceFilter }, _count: true, _avg: { rating: true } }),
      // Yorumuna YANIT GELEN benzersiz işletme sayısı ("sesin duyuldu").
      prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
        SELECT COUNT(DISTINCT q."dealerId")::bigint AS n
        FROM "Feedback" f
        JOIN "QRCode" q ON q."id" = f."qrCodeId"
        WHERE f."userId" = ${userId}
          AND f."dealerRepliedAt" IS NOT NULL
          AND f."createdAt" >= ${since}
      `),
      // En çok yorum yapılan işletme.
      prisma.$queryRaw<Array<{ dealerId: string; n: bigint }>>(Prisma.sql`
        SELECT q."dealerId" AS "dealerId", COUNT(*)::bigint AS n
        FROM "Feedback" f
        JOIN "QRCode" q ON q."id" = f."qrCodeId"
        WHERE f."userId" = ${userId} AND f."createdAt" >= ${since}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 1
      `),
      prisma.consumption.aggregate({ where: { customerId: userId, createdAt: sinceFilter }, _count: true, _sum: { amount: true } }),
      prisma.userBadge.count({ where: { userId, earnedAt: sinceFilter } }),
      // Kazanılan puan (points_credited event toplamı).
      prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COALESCE(SUM((data->>'points')::int), 0)::bigint AS total
        FROM "AnalyticsEvent"
        WHERE "userId" = ${userId} AND "event" = 'points_credited' AND "createdAt" >= ${since}
      `),
      // Harcanan puan (shop/gift/badge harcama event'leri varsa).
      prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COALESCE(SUM((data->>'points')::int), 0)::bigint AS total
        FROM "AnalyticsEvent"
        WHERE "userId" = ${userId} AND "event" = 'points_spent' AND "createdAt" >= ${since}
      `),
      prisma.userStreak.findUnique({ where: { userId }, select: { longestStreak: true, currentStreak: true } }),
      prisma.squadBattleParticipant.count({ where: { userId, createdAt: sinceFilter } }),
    ]);

    const repliedDealers = repliedDealerRows[0] ? Number(repliedDealerRows[0].n) : 0;
    let topDealer: { name: string; visits: number } | null = null;
    if (topDealerRows[0]) {
      const d = await prisma.user.findUnique({
        where: { id: topDealerRows[0].dealerId },
        select: { businessName: true, name: true },
      });
      topDealer = { name: d?.businessName || d?.name || 'Bir işletme', visits: Number(topDealerRows[0].n) };
    }

    const totalFeedbacks = feedbackAgg._count;
    const impactRate = totalFeedbacks > 0 ? Math.round((repliedDealers / Math.max(1, totalFeedbacks)) * 100) : 0;

    return NextResponse.json(
      {
        period,
        memberSince: user?.createdAt ?? null,
        level: user?.level ?? 1,
        currentPoints: user?.points ?? 0,
        xp: user?.xp ?? 0,
        feedback: {
          total: totalFeedbacks,
          avgRating: feedbackAgg._avg.rating != null ? Number(feedbackAgg._avg.rating.toFixed(1)) : null,
          dealersWhoActed: repliedDealers,
          impactRate, // yorumlarının yüzde kaçına işletme yanıt verdi
        },
        visits: {
          count: consumptionAgg._count,
          totalSpent: consumptionAgg._sum.amount ?? 0,
          topDealer,
        },
        rewards: {
          badgesEarned: badgeCount,
          pointsEarned: pointsEarnedRows[0] ? Number(pointsEarnedRows[0].total) : 0,
          pointsSpent: pointsSpentRows[0] ? Number(pointsSpentRows[0].total) : 0,
        },
        social: {
          squadBattles: battlesWon,
          longestStreak: streak?.longestStreak ?? 0,
          currentStreak: streak?.currentStreak ?? 0,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[MY_YEAR_ERROR]', error);
    return NextResponse.json({ error: 'Özet alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
