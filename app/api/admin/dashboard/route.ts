import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { unstable_cache } from 'next/cache';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { ADMIN_DASHBOARD_TAG } from '@/lib/cache-tags';


export const dynamic = 'force-dynamic';

/**
 * Admin dashboard verisi tamamen toplulaştırma (viewer'a özel veri YOK) ve her
 * yüklemede ~24 sorgu çalıştırıyordu. unstable_cache ile 60sn tag'lı cache:
 * feedback/consumption mutation'larında revalidateTag(ADMIN_DASHBOARD_TAG) ile
 * bayatlatılabilir. Auth cache DIŞINDA kalır (her istek yetki kontrolünden geçer).
 */
const getDashboardData = unstable_cache(
  async () => {
    // Get date ranges
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Core queries (always work)
    const [
      totalUsers,
      totalFeedbacks,
      totalQRCodes,
      activeQRCodes,
      usersThisMonth,
      usersLastMonth,
      feedbacksThisMonth,
      feedbacksLastMonth,
      recentUsers,
      recentFeedbacks,
      topDealers,
      positiveFeedbacks,
      neutralFeedbacks,
      negativeFeedbacks,
      totalScans,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.feedback.count(),
      prisma.qRCode.count(),
      prisma.qRCode.count({ where: { isActive: true } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000),
            lt: thirtyDaysAgo
          }
        }
      }),
      prisma.feedback.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.feedback.count({
        where: {
          createdAt: {
            gte: new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000),
            lt: thirtyDaysAgo
          }
        }
      }),
      prisma.user.findMany({
        take: 25,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, image: true, role: true, createdAt: true }
      }),
      prisma.feedback.findMany({
        take: 25,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, text: true, rating: true, sentiment: true, createdAt: true,
          user: { select: { name: true } },
          qrCode: { select: { name: true, dealer: { select: { businessName: true } } } }
        }
      }),
      // Sadece dealer kimlik bilgileri; feedback sayım/ortalaması aşağıda TEK
      // gruplanmış SQL ile hesaplanır (önceden top 10 dealer'ın TÜM rating
      // satırları nested çekilip JS'te flatMap+reduce ediliyordu → busy dealer'da
      // binlerce satır belleğe).
      prisma.user.findMany({
        where: { role: 'DEALER' },
        take: 10,
        select: { id: true, businessName: true, name: true },
      }),
      prisma.feedback.count({ where: { sentiment: 'positive' } }),
      prisma.feedback.count({ where: { sentiment: 'neutral' } }),
      prisma.feedback.count({ where: { sentiment: 'negative' } }),
      prisma.qRCode.aggregate({ _sum: { scanCount: true } }),
    ]);

    // Card system queries (with fallback)
    let cardStats = { total: 0, activated: 0, unused: 0, blocked: 0, consumptions: 0, reviews: 0 };
    let consumptionReviewsThisMonth = 0;
    let consumptionReviewsLastMonth = 0;
    let recentConsumptionReviews: any[] = [];
    
    try {
      const [totalCards, activatedCards, unusedCards, blockedCards, totalConsumptions, totalConsumptionReviews, consumptionReviews, reviewsThisMonth, reviewsLastMonth] = await Promise.all([
        prisma.physicalCard.count(),
        prisma.physicalCard.count({ where: { status: 'ACTIVATED' } }),
        prisma.physicalCard.count({ where: { status: 'UNUSED' } }),
        prisma.physicalCard.count({ where: { status: 'BLOCKED' } }),
        prisma.consumption.count(),
        prisma.consumptionReview.count(),
        prisma.consumptionReview.findMany({
          take: 15,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, text: true, rating: true, createdAt: true,
            customer: { select: { name: true, image: true } },
            consumption: {
              select: {
                dealer: { select: { businessName: true, name: true } },
                product: { select: { name: true } }
              }
            }
          }
        }),
        prisma.consumptionReview.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
        prisma.consumptionReview.count({
          where: {
            createdAt: {
              gte: new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000),
              lt: thirtyDaysAgo,
            },
          },
        }),
      ]);
      
      cardStats = {
        total: totalCards,
        activated: activatedCards,
        unused: unusedCards,
        blocked: blockedCards,
        consumptions: totalConsumptions,
        reviews: totalConsumptionReviews,
      };
      consumptionReviewsThisMonth = reviewsThisMonth;
      consumptionReviewsLastMonth = reviewsLastMonth;
      recentConsumptionReviews = consumptionReviews;
    } catch (e) {
      console.error('Card system not available:', e);
    }

    const totalCommentsThisMonth = feedbacksThisMonth + consumptionReviewsThisMonth;
    const totalCommentsLastMonth = feedbacksLastMonth + consumptionReviewsLastMonth;
    const totalCommentsChange = totalCommentsLastMonth > 0
      ? Math.round(((totalCommentsThisMonth - totalCommentsLastMonth) / totalCommentsLastMonth) * 100)
      : totalCommentsThisMonth > 0 ? 100 : 0;

    // Calculate percentage changes
    const userChange = usersLastMonth > 0 
      ? Math.round(((usersThisMonth - usersLastMonth) / usersLastMonth) * 100)
      : usersThisMonth > 0 ? 100 : 0;
      
    const feedbackChange = feedbacksLastMonth > 0 
      ? Math.round(((feedbacksThisMonth - feedbacksLastMonth) / feedbacksLastMonth) * 100)
      : feedbacksThisMonth > 0 ? 100 : 0;

    const scans = totalScans._sum.scanCount || 0;

    // Format top dealers
    // Dealer başına feedback sayım + ortalama puanı TEK SQL ile (Feedback→QRCode
    // join, GROUP BY dealerId). JS map-reduce yerine DB'de hesaplanır.
    const dealerIds = topDealers.map((d: any) => d.id);
    const dealerStatsRows = dealerIds.length > 0
      ? await prisma.$queryRaw<Array<{ dealerId: string; cnt: bigint; avg: number }>>(Prisma.sql`
          SELECT q."dealerId" AS "dealerId",
                 COUNT(f."id")::bigint AS cnt,
                 COALESCE(AVG(f."rating"), 0) AS avg
          FROM "QRCode" q
          JOIN "Feedback" f ON f."qrCodeId" = q."id"
          WHERE q."dealerId" IN (${Prisma.join(dealerIds)})
          GROUP BY q."dealerId"
        `)
      : [];
    const dealerStatsMap = new Map<string, { count: number; avg: number }>();
    for (const r of dealerStatsRows) {
      dealerStatsMap.set(r.dealerId, { count: Number(r.cnt), avg: Number(r.avg) });
    }

    const formattedTopDealers = topDealers.map((dealer: any) => {
      const s = dealerStatsMap.get(dealer.id);
      return {
        id: dealer.id,
        name: dealer.businessName || dealer.name || 'İsimsiz İşletme',
        feedbacks: s?.count ?? 0,
        rating: s ? parseFloat(s.avg.toFixed(1)) : 0,
      };
    }).sort((a: any, b: any) => b.feedbacks - a.feedbacks);

    // Format recent feedbacks
    const formattedRecentFeedbacks = recentFeedbacks.map((f: any) => ({
      id: f.id,
      text: f.text || 'Yorum yapılmadı',
      rating: f.rating,
      sentiment: f.sentiment || 'neutral',
      createdAt: f.createdAt,
      userName: f.user?.name || 'Anonim',
      businessName: f.qrCode.dealer?.businessName || f.qrCode.name,
      type: 'qr',
    }));
    
    // Format recent consumption reviews
    const formattedConsumptionReviews = recentConsumptionReviews.map((r: any) => ({
      id: r.id,
      text: r.text || 'Yorum yapılmadı',
      rating: r.rating,
      sentiment: r.rating >= 4 ? 'positive' : r.rating >= 3 ? 'neutral' : 'negative',
      createdAt: r.createdAt,
      userName: r.customer?.name || 'Anonim',
      businessName: r.consumption?.dealer?.businessName || r.consumption?.dealer?.name || 'İşletme',
      productName: r.consumption?.product?.name,
      type: 'consumption',
    }));
    
    // Combine and sort all recent reviews (more for detailed dashboard)
    const allRecentReviews = [...formattedRecentFeedbacks, ...formattedConsumptionReviews]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 35);

    // Total all reviews
    const totalAllReviews = totalFeedbacks + cardStats.reviews;

    // Sentiment özeti — önceden TÜM feedback + review tablosu belleğe çekilip
    // JS'te sayılıyordu. Artık SQL CASE ile bucket sayımı (satır transferi yok):
    // - Feedback'te sentiment varsa onu, yoksa rating fallback'i kullan
    // - Consumption review rating üzerinden dahil edilir
    const [fbSent, crSent] = await Promise.all([
      prisma.$queryRaw<Array<{ bucket: string; n: bigint }>>(Prisma.sql`
        SELECT CASE
          WHEN "sentiment" IN ('positive','negative','neutral') THEN "sentiment"
          WHEN "rating" >= 4 THEN 'positive'
          WHEN "rating" >= 3 THEN 'neutral'
          ELSE 'negative' END AS bucket,
          COUNT(*) AS n
        FROM "Feedback" WHERE "deletedAt" IS NULL
        GROUP BY 1
      `),
      prisma.$queryRaw<Array<{ bucket: string; n: bigint }>>(Prisma.sql`
        SELECT CASE
          WHEN "rating" >= 4 THEN 'positive'
          WHEN "rating" >= 3 THEN 'neutral'
          ELSE 'negative' END AS bucket,
          COUNT(*) AS n
        FROM "ConsumptionReview"
        GROUP BY 1
      `),
    ]);
    const sentimentSummary = { positive: 0, neutral: 0, negative: 0 };
    for (const row of [...fbSent, ...crSent]) {
      if (row.bucket in sentimentSummary) {
        sentimentSummary[row.bucket as keyof typeof sentimentSummary] += Number(row.n);
      }
    }

    // Stats for cards
    const stats = [
      {
        title: 'Toplam Kullanıcı',
        value: totalUsers,
        change: userChange,
        icon: 'Users',
        iconColor: 'text-blue-500',
        iconBgColor: 'bg-blue-500/10',
      },
      {
        title: 'Toplam Yorum',
        value: totalAllReviews,
        change: totalCommentsChange,
        icon: 'MessageSquare',
        iconColor: 'text-green-500',
        iconBgColor: 'bg-green-500/10',
      },
      {
        title: 'Aktif Kartlar',
        value: cardStats.activated,
        change: cardStats.total > 0 ? Math.round((cardStats.activated / cardStats.total) * 100) : 0,
        icon: 'CreditCard',
        iconColor: 'text-cyan-500',
        iconBgColor: 'bg-cyan-500/10',
      },
      {
        title: 'Tüketimler',
        value: cardStats.consumptions,
        change: 0,
        icon: 'TrendingUp',
        iconColor: 'text-orange-500',
        iconBgColor: 'bg-orange-500/10',
      },
    ];

    return {
      success: true as const,
      stats,
      recentUsers,
      recentFeedbacks: allRecentReviews,
      topDealers: formattedTopDealers,
      sentiment: {
        positive: sentimentSummary.positive,
        neutral: sentimentSummary.neutral,
        negative: sentimentSummary.negative,
      },
      totals: {
        users: totalUsers,
        feedbacks: totalAllReviews,
        qrCodes: totalQRCodes,
        activeQRCodes,
        scans,
        ...cardStats,
      },
      cardStats,
    };
  },
  ['admin-dashboard'],
  { revalidate: 60, tags: [ADMIN_DASHBOARD_TAG] }
);

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const data = await getDashboardData();
    return NextResponse.json(data, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    return NextResponse.json(
      { error: 'Dashboard verileri getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
