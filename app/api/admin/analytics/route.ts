import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const sectionsParam = searchParams.get('sections');
    const sections = sectionsParam
      ? sectionsParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      : null;

    // Calculate date ranges
    const now = new Date();
    let startDate = new Date();
    let prevStartDate = new Date();
    let daysCount = 30;
    
    switch (period) {
      case '7d':
        daysCount = 7;
        startDate.setDate(now.getDate() - 7);
        prevStartDate.setDate(now.getDate() - 14);
        break;
      case '90d':
        daysCount = 90;
        startDate.setDate(now.getDate() - 90);
        prevStartDate.setDate(now.getDate() - 180);
        break;
      case '1y':
        daysCount = 365;
        startDate.setDate(now.getDate() - 365);
        prevStartDate.setDate(now.getDate() - 730);
        break;
      default:
        daysCount = 30;
        startDate.setDate(now.getDate() - 30);
        prevStartDate.setDate(now.getDate() - 60);
    }

    // Parallel queries for core stats
    const [
      totalUsers,
      usersCurrentPeriod,
      usersPrevPeriod,
      totalFeedbacks,
      feedbacksCurrentPeriod,
      feedbacksPrevPeriod,
      totalQRCodes,
      activeQRCodes,
      totalScansResult,
      recentUsers,
      topDealers,
      feedbacksWithRating,
      allFeedbacksForTrend,
      usersByRole,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: startDate } } }),
      prisma.user.count({ where: { createdAt: { gte: prevStartDate, lt: startDate } } }),
      prisma.feedback.count(),
      prisma.feedback.count({ where: { createdAt: { gte: startDate } } }),
      prisma.feedback.count({ where: { createdAt: { gte: prevStartDate, lt: startDate } } }),
      prisma.qRCode.count(),
      prisma.qRCode.count({ where: { isActive: true } }),
      prisma.qRCode.aggregate({ _sum: { scanCount: true } }),
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, image: true, role: true, createdAt: true },
      }),
      prisma.user.findMany({
        where: { role: 'DEALER' },
        take: 10,
        select: { id: true, businessName: true, name: true },
      }),
      prisma.feedback.findMany({
        where: { createdAt: { gte: startDate } },
        select: { rating: true, sentiment: true, createdAt: true },
      }),
      prisma.feedback.findMany({
        where: { createdAt: { gte: prevStartDate } },
        select: { rating: true, sentiment: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.user.groupBy({
        by: ['role'],
        _count: true,
      }),
    ]);

    // Card system stats
    let cardStats = { total: 0, activated: 0, unused: 0, blocked: 0, consumptions: 0, reviews: 0 };
    let consumptionReviews: any[] = [];
    let recentConsumptions: any[] = [];
    
    try {
      const [totalCards, activatedCards, unusedCards, blockedCards, totalConsumptions, totalConsumptionReviews, recentConsReviews, recentCons] = await Promise.all([
        prisma.physicalCard.count(),
        prisma.physicalCard.count({ where: { status: 'ACTIVATED' } }),
        prisma.physicalCard.count({ where: { status: 'UNUSED' } }),
        prisma.physicalCard.count({ where: { status: 'BLOCKED' } }),
        prisma.consumption.count(),
        prisma.consumptionReview.count(),
        prisma.consumptionReview.findMany({
          where: { createdAt: { gte: startDate } },
          select: { rating: true, createdAt: true },
        }),
        prisma.consumption.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, createdAt: true,
            customer: { select: { name: true } },
            product: { select: { name: true } },
            dealer: { select: { businessName: true } },
          },
        }),
      ]);
      
      cardStats = { total: totalCards, activated: activatedCards, unused: unusedCards, blocked: blockedCards, consumptions: totalConsumptions, reviews: totalConsumptionReviews };
      consumptionReviews = recentConsReviews;
      recentConsumptions = recentCons;
    } catch (e) {
      console.error('Card system not available:', e);
    }

    // Calculate growth rates
    const userGrowth = usersPrevPeriod > 0
      ? Math.round(((usersCurrentPeriod - usersPrevPeriod) / usersPrevPeriod) * 100)
      : usersCurrentPeriod > 0 ? 100 : 0;
      
    const feedbackGrowth = feedbacksPrevPeriod > 0
      ? Math.round(((feedbacksCurrentPeriod - feedbacksPrevPeriod) / feedbacksPrevPeriod) * 100)
      : feedbacksCurrentPeriod > 0 ? 100 : 0;

    // Combine all feedbacks for calculations
    const allFeedbacksRating = [
      ...feedbacksWithRating,
      ...consumptionReviews.map((r: any) => ({
        rating: r.rating,
        sentiment: r.rating >= 4 ? 'positive' : r.rating >= 3 ? 'neutral' : 'negative',
        createdAt: r.createdAt,
      })),
    ];

    // Average rating
    const avgRating = allFeedbacksRating.length > 0
      ? allFeedbacksRating.reduce((sum, f) => sum + f.rating, 0) / allFeedbacksRating.length
      : 0;

    // Sentiment breakdown
    const positiveFeedbacks = allFeedbacksRating.filter(f => f.sentiment === 'positive').length;
    const neutralFeedbacks = allFeedbacksRating.filter(f => f.sentiment === 'neutral' || !f.sentiment).length;
    const negativeFeedbacks = allFeedbacksRating.filter(f => f.sentiment === 'negative').length;
    const totalSentiment = positiveFeedbacks + neutralFeedbacks + negativeFeedbacks || 1;

    // Rating distribution
    const ratingDistribution = {
      5: allFeedbacksRating.filter(f => f.rating === 5).length,
      4: allFeedbacksRating.filter(f => f.rating === 4).length,
      3: allFeedbacksRating.filter(f => f.rating === 3).length,
      2: allFeedbacksRating.filter(f => f.rating === 2).length,
      1: allFeedbacksRating.filter(f => f.rating === 1).length,
    };

    // Daily trend data
    const dailyData: any[] = [];
    const allTrendFeedbacks = [
      ...allFeedbacksForTrend,
      ...consumptionReviews.map((r: any) => ({
        rating: r.rating,
        sentiment: r.rating >= 4 ? 'positive' : r.rating >= 3 ? 'neutral' : 'negative',
        createdAt: r.createdAt,
      })),
    ];
    
    for (let i = daysCount - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      
      const dayFeedbacks = allTrendFeedbacks.filter(f => {
        const fDate = new Date(f.createdAt);
        return fDate >= dayStart && fDate <= dayEnd;
      });
      
      const dayPositive = dayFeedbacks.filter(f => f.sentiment === 'positive').length;
      const dayNegative = dayFeedbacks.filter(f => f.sentiment === 'negative').length;
      
      dailyData.push({
        date: dayStart.toISOString().split('T')[0],
        label: dayStart.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
        feedbacks: dayFeedbacks.length,
        avgRating: dayFeedbacks.length > 0 
          ? Number((dayFeedbacks.reduce((acc, f) => acc + f.rating, 0) / dayFeedbacks.length).toFixed(1))
          : 0,
        positive: dayPositive,
        negative: dayNegative,
        neutral: dayFeedbacks.length - dayPositive - dayNegative,
      });
    }

    // Hourly heatmap (7 days x 24 hours)
    const heatmapData: number[][] = Array(7).fill(null).map(() => Array(24).fill(0));
    allTrendFeedbacks.forEach(f => {
      const date = new Date(f.createdAt);
      const dayOfWeek = date.getDay();
      const hour = date.getHours();
      heatmapData[dayOfWeek][hour]++;
    });

    // Top dealers with proper calculations
    // Önceden top-10 dealer'ın TÜM feedback satırları nested çekiliyordu (busy
    // dealer'da büyük transfer). Artık dealer başına count/avg/positive tek SQL'de.
    const topDealerIds = topDealers.map((d) => d.id);
    const topDealerAgg = topDealerIds.length === 0 ? [] : await prisma.$queryRaw<
      Array<{ dealerId: string; feedbackCount: bigint; avgRating: number | null; positiveCount: bigint }>
    >(Prisma.sql`
      SELECT q."dealerId" AS "dealerId",
             COUNT(f."id") AS "feedbackCount",
             AVG(f."rating") AS "avgRating",
             COUNT(*) FILTER (WHERE f."sentiment" = 'positive') AS "positiveCount"
      FROM "QRCode" q
      JOIN "Feedback" f ON f."qrCodeId" = q."id"
      WHERE q."dealerId" IN (${Prisma.join(topDealerIds)})
        AND f."deletedAt" IS NULL
      GROUP BY q."dealerId"
    `);
    const topAggByDealer = new Map(topDealerAgg.map((r) => [r.dealerId, r]));
    const formattedTopDealers = topDealers.map((dealer) => {
      const agg = topAggByDealer.get(dealer.id);
      const totalFeedbackCount = Number(agg?.feedbackCount ?? 0);
      const positiveRate = totalFeedbackCount > 0
        ? Math.round((Number(agg?.positiveCount ?? 0) / totalFeedbackCount) * 100)
        : 0;
      return {
        id: dealer.id,
        name: dealer.businessName || dealer.name || 'İsimsiz İşletme',
        feedbackCount: totalFeedbackCount,
        avgRating: Number((agg?.avgRating != null ? Number(agg.avgRating) : 0).toFixed(1)),
        positiveRate,
      };
    }).sort((a, b) => b.feedbackCount - a.feedbackCount).slice(0, 5);

    // Recent activity
    const recentActivity: any[] = [];
    
    recentUsers.slice(0, 3).forEach(u => {
      recentActivity.push({
        type: 'user',
        description: `${u.name || 'Yeni kullanıcı'} kayıt oldu`,
        timestamp: u.createdAt,
        role: u.role,
      });
    });
    
    recentConsumptions.slice(0, 3).forEach((c: any) => {
      recentActivity.push({
        type: 'consumption',
        description: `${c.customer?.name || 'Müşteri'} - ${c.product?.name || 'Ürün'} tüketti`,
        timestamp: c.createdAt,
        dealer: c.dealer?.businessName,
      });
    });
    
    recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    const formattedActivity = recentActivity.slice(0, 10).map(a => ({
      ...a,
      timestamp: formatRelativeTime(a.timestamp),
    }));

    // Comparison data
    const prevPeriodFeedbacks = allTrendFeedbacks.filter(f => {
      const fDate = new Date(f.createdAt);
      return fDate >= prevStartDate && fDate < startDate;
    });
    const currentPeriodFeedbacks = allTrendFeedbacks.filter(f => {
      const fDate = new Date(f.createdAt);
      return fDate >= startDate;
    });

    const prevAvgRating = prevPeriodFeedbacks.length > 0
      ? prevPeriodFeedbacks.reduce((sum, f) => sum + f.rating, 0) / prevPeriodFeedbacks.length
      : 0;
    const currentAvgRating = currentPeriodFeedbacks.length > 0
      ? currentPeriodFeedbacks.reduce((sum, f) => sum + f.rating, 0) / currentPeriodFeedbacks.length
      : 0;

    const comparison = {
      feedbacks: {
        current: currentPeriodFeedbacks.length,
        previous: prevPeriodFeedbacks.length,
        change: feedbackGrowth,
      },
      rating: {
        current: currentAvgRating.toFixed(1),
        previous: prevAvgRating.toFixed(1),
        change: prevAvgRating > 0 ? Number(((currentAvgRating - prevAvgRating) / prevAvgRating * 100).toFixed(1)) : 0,
      },
      users: {
        current: usersCurrentPeriod,
        previous: usersPrevPeriod,
        change: userGrowth,
      },
    };

    // User role distribution
    const roleDistribution = usersByRole.reduce((acc: any, r) => {
      acc[r.role] = r._count;
      return acc;
    }, {});

    // Root Cause Graph (konu -> bayi -> zaman dilimi -> etki)
    const rootCauseSource = await prisma.feedback.findMany({
      where: {
        createdAt: { gte: startDate },
        deletedAt: null,
        OR: [{ sentiment: 'negative' }, { rating: { lte: 2 } }],
      },
      select: {
        id: true,
        rating: true,
        sentiment: true,
        topics: true,
        createdAt: true,
        qrCode: {
          select: {
            dealer: { select: { id: true, businessName: true, name: true } },
          },
        },
      },
      take: 1200,
      orderBy: { createdAt: 'desc' },
    });

    const rootTopicMap = new Map<
      string,
      { count: number; dealers: Map<string, number>; timeBuckets: Map<string, number> }
    >();
    for (const fb of rootCauseSource) {
      const topicsRaw = Array.isArray(fb.topics) ? fb.topics : [];
      const topics = topicsRaw.length > 0 ? topicsRaw : ['Genel Memnuniyetsizlik'];
      const dealerName =
        fb.qrCode?.dealer?.businessName || fb.qrCode?.dealer?.name || 'Bilinmeyen bayi';
      const hour = new Date(fb.createdAt).getHours();
      const timeBucket = hour < 12 ? 'Sabah' : hour < 17 ? 'Öğlen' : 'Akşam';

      for (const t of topics.slice(0, 2)) {
        const topic = String(t || 'Genel Memnuniyetsizlik');
        const existing = rootTopicMap.get(topic) || {
          count: 0,
          dealers: new Map<string, number>(),
          timeBuckets: new Map<string, number>(),
        };
        existing.count += 1;
        existing.dealers.set(dealerName, (existing.dealers.get(dealerName) || 0) + 1);
        existing.timeBuckets.set(timeBucket, (existing.timeBuckets.get(timeBucket) || 0) + 1);
        rootTopicMap.set(topic, existing);
      }
    }

    const rootCauseGraph = Array.from(rootTopicMap.entries())
      .map(([topic, info]) => {
        const topDealer = Array.from(info.dealers.entries()).sort((a, b) => b[1] - a[1])[0];
        const topTime = Array.from(info.timeBuckets.entries()).sort((a, b) => b[1] - a[1])[0];
        const impactScore = Math.min(100, Math.round((info.count / Math.max(1, totalFeedbacks)) * 1000));
        return {
          topic,
          dealer: topDealer?.[0] || 'Bilinmeyen bayi',
          timeBucket: topTime?.[0] || 'Bilinmiyor',
          count: info.count,
          impactScore,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Tenant Benchmark + anomaly
    const dealerBenchBase = await prisma.user.findMany({
      where: { role: 'DEALER' },
      select: {
        id: true,
        businessName: true,
        name: true,
        businessCategory: true,
      },
      take: 250,
    });
    // Önceden 250 dealer × findMany(500) = ~125K satır transferi + JS ortalama.
    // Artık tek SQL ile dealer başına AVG(rating) + COUNT (qrCode join, dönem filtreli).
    const benchIds = dealerBenchBase.map((d) => d.id);
    const benchAggRows = benchIds.length === 0 ? [] : await prisma.$queryRaw<
      Array<{ dealerId: string; feedbackCount: bigint; avgRating: number | null }>
    >(Prisma.sql`
      SELECT q."dealerId" AS "dealerId",
             COUNT(f."id") AS "feedbackCount",
             AVG(f."rating") AS "avgRating"
      FROM "QRCode" q
      JOIN "Feedback" f ON f."qrCodeId" = q."id"
      WHERE q."dealerId" IN (${Prisma.join(benchIds)})
        AND f."deletedAt" IS NULL
        AND f."createdAt" >= ${startDate}
      GROUP BY q."dealerId"
    `);
    const benchByDealer = new Map(benchAggRows.map((r) => [r.dealerId, r]));
    const dealerBenchRows = dealerBenchBase.map((dealer) => {
      const agg = benchByDealer.get(dealer.id);
      const count = Number(agg?.feedbackCount ?? 0);
      return {
        dealerId: dealer.id,
        dealerName: dealer.businessName || dealer.name || 'İsimsiz işletme',
        segment: dealer.businessCategory || 'general',
        feedbackCount: count,
        avgRating: Number((agg?.avgRating != null ? Number(agg.avgRating) : 0).toFixed(2)),
      };
    });

    const segmentStats = new Map<string, { ratings: number[] }>();
    for (const row of dealerBenchRows) {
      const seg = segmentStats.get(row.segment) || { ratings: [] };
      if (row.feedbackCount >= 3) seg.ratings.push(row.avgRating);
      segmentStats.set(row.segment, seg);
    }

    const tenantBenchmark = dealerBenchRows
      .map((row) => {
        const ratings = segmentStats.get(row.segment)?.ratings || [];
        const segmentAvg =
          ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : row.avgRating;
        const variance =
          ratings.length > 1
            ? ratings.reduce((sum, r) => sum + Math.pow(r - segmentAvg, 2), 0) / ratings.length
            : 0;
        const stdDev = Math.sqrt(variance);
        const zScore = stdDev > 0 ? (row.avgRating - segmentAvg) / stdDev : 0;
        const deviation = Number((row.avgRating - segmentAvg).toFixed(2));
        const anomaly =
          row.feedbackCount >= 5 && (zScore <= -1.2 || zScore >= 1.8)
            ? zScore <= -1.2
              ? 'negative'
              : 'positive'
            : 'normal';
        return {
          dealerId: row.dealerId,
          dealerName: row.dealerName,
          segment: row.segment,
          feedbackCount: row.feedbackCount,
          avgRating: row.avgRating,
          segmentAvg: Number(segmentAvg.toFixed(2)),
          deviation,
          anomaly,
        };
      })
      .sort((a, b) => {
        if (a.anomaly === b.anomaly) return Math.abs(b.deviation) - Math.abs(a.deviation);
        if (a.anomaly === 'negative') return -1;
        if (b.anomaly === 'negative') return 1;
        if (a.anomaly === 'positive') return -1;
        if (b.anomaly === 'positive') return 1;
        return 0;
      })
      .slice(0, 20);

    const fullData: Record<string, unknown> = {
      totalUsers,
      totalFeedbacks: totalFeedbacks + cardStats.reviews,
      totalQRCodes,
      avgRating: Number(avgRating.toFixed(1)),
      userGrowth,
      feedbackGrowth,
      totalScans: totalScansResult._sum.scanCount || 0,
      activeQRCodes,
      sentimentBreakdown: {
        positive: Math.round((positiveFeedbacks / totalSentiment) * 100),
        neutral: Math.round((neutralFeedbacks / totalSentiment) * 100),
        negative: Math.round((negativeFeedbacks / totalSentiment) * 100),
      },
      ratingDistribution,
      dailyData,
      heatmapData,
      topDealers: formattedTopDealers,
      recentActivity: formattedActivity,
      cardStats,
      comparison,
      roleDistribution,
      rootCauseGraph,
      tenantBenchmark,
      totals: {
        users: totalUsers,
        feedbacks: totalFeedbacks,
        qrCodes: totalQRCodes,
        activeQRCodes,
        scans: totalScansResult._sum.scanCount || 0,
        ...cardStats,
      },
    };

    const sectionKeys: Record<string, string[]> = {
      overview: ['totalUsers', 'totalFeedbacks', 'totalQRCodes', 'avgRating', 'userGrowth', 'feedbackGrowth', 'totalScans', 'activeQRCodes', 'sentimentBreakdown', 'ratingDistribution', 'comparison', 'roleDistribution', 'totals'],
      trends: ['dailyData', 'heatmapData'],
      dealers: ['topDealers', 'tenantBenchmark'],
      root: ['rootCauseGraph'],
      cards: ['cardStats'],
      activity: ['recentActivity'],
    };

    let data = fullData;
    if (sections && sections.length > 0) {
      const allowed = new Set(sections.flatMap((s) => sectionKeys[s] ?? []));
      data = Object.fromEntries(Object.entries(fullData).filter(([k]) => allowed.has(k)));
    }

    return NextResponse.json({ success: true, data }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: 'Analitik verileri getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Az önce';
  if (diffMins < 60) return `${diffMins} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  if (diffDays < 7) return `${diffDays} gün önce`;
  return then.toLocaleDateString('tr-TR');
}
