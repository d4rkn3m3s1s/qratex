import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

/** Session + token replay uses `headers()` — must not participate in static route analysis. */
export const dynamic = 'force-dynamic';

function weightedAvgRating(
  aCount: number,
  aAvg: number | null | undefined,
  bCount: number,
  bAvg: number | null | undefined
): number {
  const n = aCount + bCount;
  if (n === 0) return 0;
  const a = (aAvg ?? 0) * aCount;
  const b = (bAvg ?? 0) * bCount;
  return (a + b) / n;
}

function utcDayKey(offsetFromToday: number, now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offsetFromToday));
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const dealerId = session.user.id;

    // REDIS CACHE: bu uç ~10 agregasyon/raw sorgu içeriyor + cache'sizdi. Bayi başına 45s
    // cache: hit'te tüm sorgular atlanır. Redis yoksa cache-miss gibi → davranış aynı.
    const { redisGetJson, redisSetJson } = await import('@/lib/redis');
    const statsCacheKey = `dealer-stats:${dealerId}`;
    const cachedStats = await redisGetJson<object>(statsCacheKey);
    if (cachedStats) {
      return NextResponse.json(cachedStats, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Date ranges for comparison
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prev30Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const from14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    let useSoftDelete = true;
    try {
      await prisma.feedback.count({ where: { qrCode: { dealerId }, deletedAt: null } });
    } catch {
      useSoftDelete = false;
    }
    const fbWhere = useSoftDelete
      ? ({ qrCode: { dealerId }, deletedAt: null } as const)
      : ({ qrCode: { dealerId } } as const);
    const crWhere = { consumption: { dealerId } } as const;

    const dailySql = useSoftDelete
      ? Prisma.sql`
          SELECT (date_trunc('day', u."createdAt"))::date AS d,
                 COUNT(*)::bigint AS cnt,
                 AVG(u.rating)::float AS avgr
          FROM (
            SELECT f."createdAt", f.rating
            FROM "Feedback" f
            INNER JOIN "QRCode" q ON q.id = f."qrCodeId"
            WHERE q."dealerId" = ${dealerId} AND f."deletedAt" IS NULL
            UNION ALL
            SELECT cr."createdAt", cr.rating
            FROM "ConsumptionReview" cr
            INNER JOIN "Consumption" c ON c.id = cr."consumptionId"
            WHERE c."dealerId" = ${dealerId}
          ) u
          WHERE u."createdAt" >= ${from14Days} AND u."createdAt" <= ${now}
          GROUP BY 1
          ORDER BY 1
        `
      : Prisma.sql`
          SELECT (date_trunc('day', u."createdAt"))::date AS d,
                 COUNT(*)::bigint AS cnt,
                 AVG(u.rating)::float AS avgr
          FROM (
            SELECT f."createdAt", f.rating
            FROM "Feedback" f
            INNER JOIN "QRCode" q ON q.id = f."qrCodeId"
            WHERE q."dealerId" = ${dealerId}
            UNION ALL
            SELECT cr."createdAt", cr.rating
            FROM "ConsumptionReview" cr
            INNER JOIN "Consumption" c ON c.id = cr."consumptionId"
            WHERE c."dealerId" = ${dealerId}
          ) u
          WHERE u."createdAt" >= ${from14Days} AND u."createdAt" <= ${now}
          GROUP BY 1
          ORDER BY 1
        `;

    const [
      qrMeta,
      dailyRows,
      aggregates,
    ] = await Promise.all([
      Promise.all([
        prisma.qRCode.count({ where: { dealerId } }),
        prisma.qRCode.count({ where: { dealerId, isActive: true } }),
        prisma.qRCode.aggregate({
          where: { dealerId },
          _sum: { scanCount: true },
        }),
        prisma.qRCode.findMany({
          where: { dealerId },
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            scanCount: true,
            _count: { select: { feedbacks: true } },
          },
          orderBy: { scanCount: 'desc' },
          take: 250,
        }),
      ]),
      prisma.$queryRaw<Array<{ d: Date; cnt: bigint; avgr: number | null }>>(dailySql),
      Promise.all([
        prisma.feedback.count({ where: fbWhere }),
        prisma.consumptionReview.count({ where: crWhere }),
        prisma.feedback.count({ where: { ...fbWhere, createdAt: { gte: last30Days } } }),
        prisma.consumptionReview.count({ where: { ...crWhere, createdAt: { gte: last30Days } } }),
        prisma.feedback.count({
          where: { ...fbWhere, createdAt: { gte: prev30Days, lt: last30Days } },
        }),
        prisma.consumptionReview.count({
          where: { ...crWhere, createdAt: { gte: prev30Days, lt: last30Days } },
        }),
        prisma.feedback.count({ where: { ...fbWhere, createdAt: { gte: last7Days } } }),
        prisma.consumptionReview.count({ where: { ...crWhere, createdAt: { gte: last7Days } } }),
        prisma.feedback.aggregate({ where: fbWhere, _avg: { rating: true } }),
        prisma.consumptionReview.aggregate({ where: crWhere, _avg: { rating: true } }),
        prisma.feedback.aggregate({
          where: { ...fbWhere, createdAt: { gte: prev30Days, lt: last30Days } },
          _avg: { rating: true },
        }),
        prisma.consumptionReview.aggregate({
          where: { ...crWhere, createdAt: { gte: prev30Days, lt: last30Days } },
          _avg: { rating: true },
        }),
        prisma.feedback.groupBy({
          by: ['sentiment'],
          where: fbWhere,
          _count: { _all: true },
        }),
        prisma.feedback.groupBy({
          by: ['qrCodeId'],
          where: fbWhere,
          _avg: { rating: true },
        }),
        prisma.consumptionReview.count({ where: { ...crWhere, rating: { gte: 4 } } }),
        prisma.consumptionReview.count({ where: { ...crWhere, rating: 3 } }),
        prisma.consumptionReview.count({ where: { ...crWhere, rating: { lt: 3 } } }),
      ]),
    ]);

    const [totalQRCodes, activeQRCodes, scanAggregate, qrCodes] = qrMeta;
    const totalScans = Number(scanAggregate._sum.scanCount ?? 0);

    const [
      qrFbCount,
      crRevCount,
      qrLast30,
      crLast30,
      qrPrevWindow,
      crPrevWindow,
      qrLast7,
      crLast7,
      qrAvgAll,
      crAvgAll,
      qrAvgPrev,
      crAvgPrev,
      sentBySentiment,
      fbByQrAvg,
      crSentPos,
      crSentNeu,
      crSentNeg,
    ] = aggregates;

    const dayMap = new Map<string, { cnt: number; avgr: number }>();
    for (const row of dailyRows) {
      const key = row.d.toISOString().slice(0, 10);
      dayMap.set(key, { cnt: Number(row.cnt), avgr: row.avgr ?? 0 });
    }

    // Get consumption data (with fallback)
    let consumptionData = {
      consumptions: [] as any[],
      totalConsumptions: 0,
      totalCustomers: 0,
      consumptionReviewCount: 0,
      recentConsumptionReviews: [] as any[],
    };

    try {
      const [totalConsumptions, consumptionReviewCount, consumptionsRecent, consumptionReviews, distinctCustomers] =
        await Promise.all([
          prisma.consumption.count({ where: { dealerId } }),
          prisma.consumption.count({
            where: { dealerId, review: { isNot: null } },
          }),
          prisma.consumption.findMany({
            where: { dealerId },
            include: {
              customer: { select: { id: true, name: true, image: true } },
              product: { select: { name: true, category: { select: { name: true, icon: true } } } },
              review: { select: { id: true, rating: true, text: true, createdAt: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          }),
          prisma.consumptionReview.findMany({
            where: { consumption: { dealerId } },
            include: {
              customer: { select: { name: true, image: true } },
              consumption: { select: { product: { select: { name: true } } } },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
          prisma.$queryRaw<[{ n: bigint }]>(
            Prisma.sql`SELECT COUNT(DISTINCT "customerId")::bigint AS n FROM "Consumption" WHERE "dealerId" = ${dealerId}`
          ),
        ]);

      consumptionData = {
        consumptions: consumptionsRecent,
        totalConsumptions,
        totalCustomers: Number(distinctCustomers[0]?.n ?? 0),
        consumptionReviewCount,
        recentConsumptionReviews: consumptionReviews,
      };
    } catch (e) {
      console.log('Consumption data not available:', e);
    }

    const totalFeedbacks = qrFbCount + crRevCount;
    const avgRating = weightedAvgRating(
      qrFbCount,
      qrAvgAll._avg.rating != null ? Number(qrAvgAll._avg.rating) : null,
      crRevCount,
      crAvgAll._avg.rating != null ? Number(crAvgAll._avg.rating) : null
    );

    const currentPeriodLen = qrLast30 + crLast30;
    const previousPeriodLen = qrPrevWindow + crPrevWindow;
    const feedbackGrowth =
      previousPeriodLen > 0
        ? Math.round(((currentPeriodLen - previousPeriodLen) / previousPeriodLen) * 100)
        : currentPeriodLen > 0
          ? 100
          : 0;

    const prevWindowAvgOnly = weightedAvgRating(
      qrPrevWindow,
      qrAvgPrev._avg.rating != null ? Number(qrAvgPrev._avg.rating) : null,
      crPrevWindow,
      crAvgPrev._avg.rating != null ? Number(crAvgPrev._avg.rating) : null
    );
    const ratingChange =
      qrPrevWindow + crPrevWindow > 0
        ? Number((avgRating - prevWindowAvgOnly).toFixed(1))
        : 0;

    let posFb = 0;
    let neuFb = 0;
    let negFb = 0;
    for (const g of sentBySentiment) {
      const c = g._count._all;
      if (g.sentiment === 'positive') posFb += c;
      else if (g.sentiment === 'negative') negFb += c;
      else neuFb += c;
    }
    const sentimentData = {
      positive: posFb + crSentPos,
      neutral: neuFb + crSentNeu,
      negative: negFb + crSentNeg,
    };

    const totalSentiment = sentimentData.positive + sentimentData.neutral + sentimentData.negative || 1;
    const sentimentPercentage = {
      positive: Math.round((sentimentData.positive / totalSentiment) * 100),
      neutral: Math.round((sentimentData.neutral / totalSentiment) * 100),
      negative: Math.round((sentimentData.negative / totalSentiment) * 100),
    };

    const qrAvgMap = new Map(fbByQrAvg.map((r) => [r.qrCodeId, r._avg.rating != null ? Number(r._avg.rating) : 0]));

    // Weekly chart (UTC calendar days; matches SQL date_trunc)
    const weeklyData: Array<{ day: string; feedbacks: number; avgRating: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const key = utcDayKey(i, now);
      const cell = dayMap.get(key) ?? { cnt: 0, avgr: 0 };
      const dayStart = new Date(`${key}T12:00:00.000Z`);
      weeklyData.push({
        day: dayStart.toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'UTC' }),
        feedbacks: cell.cnt,
        avgRating: cell.cnt > 0 ? Number(cell.avgr.toFixed(1)) : 0,
      });
    }

    const previousWeekData: Array<{ day: string; feedbacks: number; avgRating: number }> = [];
    let previousWeekFeedbacks = 0;
    for (let i = 13; i >= 7; i--) {
      const key = utcDayKey(i, now);
      const cell = dayMap.get(key) ?? { cnt: 0, avgr: 0 };
      previousWeekFeedbacks += cell.cnt;
      const dayStart = new Date(`${key}T12:00:00.000Z`);
      previousWeekData.push({
        day: dayStart.toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'UTC' }),
        feedbacks: cell.cnt,
        avgRating: cell.cnt > 0 ? Number(cell.avgr.toFixed(1)) : 0,
      });
    }

    // Recent QR feedbacks (deletedAt may not exist in DB yet)
    let recentFeedbacksData: Awaited<ReturnType<typeof prisma.feedback.findMany>>;
    try {
      recentFeedbacksData = await prisma.feedback.findMany({
        where: { deletedAt: null, qrCode: { dealerId } },
        include: {
          qrCode: { select: { name: true } },
          user: { select: { name: true, image: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    } catch (deletedAtErr) {
      recentFeedbacksData = await prisma.feedback.findMany({
        where: { qrCode: { dealerId } },
        include: {
          qrCode: { select: { name: true } },
          user: { select: { name: true, image: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    }

    // Top QR codes (avg from aggregate, not full feedback rows)
    const topQRCodes = qrCodes
      .sort((a, b) => b.scanCount - a.scanCount)
      .slice(0, 6)
      .map((q) => {
        const n = q._count.feedbacks;
        const qrAvgRating = n > 0 ? qrAvgMap.get(q.id) ?? 0 : 0;
        return {
          id: q.id,
          name: q.name,
          code: q.code,
          scans: q.scanCount,
          feedbacks: n,
          avgRating: qrAvgRating.toFixed(1),
          isActive: q.isActive,
        };
      });
      
    // Performance score
    const ratingScore = (avgRating / 5) * 40;
    const engagementScore = totalScans > 0 ? Math.min((totalFeedbacks / totalScans) * 100, 30) : 0;
    const sentimentScore = sentimentPercentage.positive * 0.3;
    const performanceScore = Math.round(ratingScore + engagementScore + sentimentScore);
    
    let performanceLevel = 'Başlangıç';
    let performanceColor = 'gray';
    if (performanceScore >= 80) { performanceLevel = 'Mükemmel'; performanceColor = 'emerald'; }
    else if (performanceScore >= 60) { performanceLevel = 'Çok İyi'; performanceColor = 'green'; }
    else if (performanceScore >= 40) { performanceLevel = 'İyi'; performanceColor = 'yellow'; }
    else if (performanceScore >= 20) { performanceLevel = 'Gelişiyor'; performanceColor = 'orange'; }

    // Format recent consumption reviews
    const recentConsumptionReviewsFormatted = consumptionData.recentConsumptionReviews.slice(0, 5).map((r: any) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      sentiment: r.rating >= 4 ? 'positive' : r.rating >= 3 ? 'neutral' : 'negative',
      createdAt: r.createdAt,
      productName: r.consumption?.product?.name || 'Ürün',
      userName: r.customer?.name || 'Müşteri',
      userImage: r.customer?.image,
      type: 'consumption',
    }));
    
    // Combine recent feedbacks
    const combinedRecentFeedbacks = [
      ...recentFeedbacksData.map((f: { id: string; rating: number; text: string | null; sentiment: string | null; createdAt: Date; qrCode?: { name: string }; user?: { name: string | null; image: string | null } }) => ({
        id: f.id,
        rating: f.rating,
        text: f.text,
        sentiment: f.sentiment,
        createdAt: f.createdAt,
        qrName: f.qrCode?.name ?? 'QR',
        userName: (f.user?.name as string) || 'Anonim',
        userImage: f.user?.image,
        type: 'qr' as const,
      })),
      ...recentConsumptionReviewsFormatted,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

    const pendingReviews = consumptionData.totalConsumptions - consumptionData.consumptionReviewCount;

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [actionItemsTotal, actionItemsDone] = await Promise.all([
      prisma.actionItem.count({ where: { dealerId, createdAt: { gte: startOfMonth } } }),
      prisma.actionItem.count({ where: { dealerId, status: 'done', createdAt: { gte: startOfMonth } } }),
    ]);
    const actionCompletionRate = actionItemsTotal > 0 ? (actionItemsDone / actionItemsTotal) * 100 : 0;

    const statsPayload = {
        success: true,
        data: {
        stats: {
          totalFeedbacks,
          avgRating: avgRating.toFixed(1),
          totalQRCodes,
          activeQRCodes,
          totalScans,
          feedbackGrowth,
          ratingChange,
          weeklyFeedbacks: qrLast7 + crLast7,
          conversionRate: totalScans > 0 ? ((totalFeedbacks / totalScans) * 100).toFixed(1) : '0',
          totalConsumptions: consumptionData.totalConsumptions,
          totalCustomers: consumptionData.totalCustomers,
          consumptionReviewCount: consumptionData.consumptionReviewCount,
          pendingReviews,
          actionCompletionRate: Math.round(actionCompletionRate * 10) / 10,
          actionItemsTotal,
          actionItemsDone,
        },
        performance: { score: performanceScore, level: performanceLevel, color: performanceColor },
        sentimentData: sentimentPercentage,
        weeklyData,
        previousWeekData,
        previousWeekFeedbacks,
        recentFeedbacks: combinedRecentFeedbacks,
        qrCodes: topQRCodes,
        consumptionStats: {
          total: consumptionData.totalConsumptions,
          customers: consumptionData.totalCustomers,
          reviewed: consumptionData.consumptionReviewCount,
          pending: pendingReviews,
        },
        recentConsumptions: consumptionData.consumptions.slice(0, 5).map((c: any) => ({
          id: c.id,
          customer: c.customer,
          product: c.product,
          hasReview: !!c.review,
          review: c.review,
          createdAt: c.createdAt,
        })),
      },
    };
    await redisSetJson(statsCacheKey, statsPayload, 45); // Redis yoksa sessizce geçer
    return NextResponse.json(statsPayload, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Dealer stats error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    const errMessage = error instanceof Error ? error.message : String(error);
    const fallback = {
      success: true,
      data: {
        stats: {
          totalFeedbacks: 0,
          avgRating: '0',
          totalQRCodes: 0,
          activeQRCodes: 0,
          totalScans: 0,
          feedbackGrowth: 0,
          ratingChange: 0,
          weeklyFeedbacks: 0,
          conversionRate: '0',
          totalConsumptions: 0,
          totalCustomers: 0,
          consumptionReviewCount: 0,
          pendingReviews: 0,
        },
        performance: { score: 0, level: 'Başlangıç', color: 'gray' },
        sentimentData: { positive: 0, neutral: 0, negative: 0 },
        weeklyData: [] as Array<{ day: string; feedbacks: number; avgRating: number }>,
        previousWeekData: [] as Array<{ day: string; feedbacks: number; avgRating: number }>,
        previousWeekFeedbacks: 0,
        recentFeedbacks: [] as Array<{ id: string; rating: number; text: string | null; sentiment: string | null; createdAt: string; qrName?: string; userName: string; type?: string }>,
        qrCodes: [] as Array<{ id: string; name: string; code: string; scans: number; feedbacks: number; avgRating: string; isActive: boolean }>,
        consumptionStats: { total: 0, customers: 0, reviewed: 0, pending: 0 },
        recentConsumptions: [] as any[],
      },
      _debug: process.env.NODE_ENV === 'development' ? errMessage : undefined,
    };
    return NextResponse.json(fallback, { status: 200, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
