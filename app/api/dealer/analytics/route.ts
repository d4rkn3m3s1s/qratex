import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

function normalizePercentages(values: number[]) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);

  const raw = values.map((v) => (v / total) * 100);
  const rounded = raw.map((v) => Math.round(v));
  let diff = 100 - rounded.reduce((a, b) => a + b, 0);

  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (diff > 0 ? b.frac - a.frac : a.frac - b.frac));

  for (const item of order) {
    if (diff === 0) break;
    rounded[item.i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }

  return rounded;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const dealerId = session.user.id;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';

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
      default:
        daysCount = 30;
        startDate.setDate(now.getDate() - 30);
        prevStartDate.setDate(now.getDate() - 60);
    }

    // Cap in-memory merge (90g yoğun bayilerde DB yükünü sınırlar; sıralama eski→yeni)
    const ANALYTICS_EVENT_CAP = 20_000;

    const [qrScanAgg, qrCodes, qrFeedbacksFlat] = await Promise.all([
      prisma.qRCode.aggregate({
        where: { dealerId },
        _sum: { scanCount: true },
      }),
      prisma.qRCode.findMany({
        where: { dealerId },
        select: {
          id: true,
          name: true,
          scanCount: true,
          _count: { select: { feedbacks: true } },
        },
        orderBy: { scanCount: 'desc' },
        take: 200,
      }),
      prisma.feedback.findMany({
        where: {
          qrCode: { dealerId },
          deletedAt: null,
          createdAt: { gte: prevStartDate },
        },
        select: {
          rating: true,
          sentiment: true,
          topics: true,
          createdAt: true,
          qrCodeId: true,
        },
        orderBy: { createdAt: 'asc' },
        take: ANALYTICS_EVENT_CAP,
      }),
    ]);
    const totalScansAllQR = Number(qrScanAgg._sum.scanCount ?? 0);

    // Get consumption reviews
    let consumptionReviews: any[] = [];
    let consumptionStats = { total: 0, reviewed: 0, customers: 0 };

    try {
      const [reviewRows, consumptionWindowTotal, consumptionWindowReviewed, distinctCustomers] =
        await Promise.all([
          prisma.consumptionReview.findMany({
            where: { consumption: { dealerId }, createdAt: { gte: prevStartDate } },
            select: { rating: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
            take: ANALYTICS_EVENT_CAP,
          }),
          prisma.consumption.count({
            where: { dealerId, createdAt: { gte: prevStartDate } },
          }),
          prisma.consumption.count({
            where: { dealerId, createdAt: { gte: prevStartDate }, review: { isNot: null } },
          }),
          prisma.$queryRaw<[{ n: bigint }]>(
            Prisma.sql`SELECT COUNT(DISTINCT "customerId")::bigint AS n FROM "Consumption" WHERE "dealerId" = ${dealerId}`
          ),
        ]);

      consumptionReviews = reviewRows;
      consumptionStats = {
        total: consumptionWindowTotal,
        reviewed: consumptionWindowReviewed,
        customers: Number(distinctCustomers[0]?.n ?? 0),
      };
    } catch (e) {
      console.log('Consumption data not available');
    }

    // ── MANŞET SAYILAR: DB AGREGASYONU (cap'siz, KESİN) ──
    // Önceden totalFeedbacks/avgRating cap'li 20k in-memory diziden hesaplanıyordu → >20k
    // feedback'i olan bayide YANLIŞ (hatta orderBy asc + cap yüzünden güncel dönem sıfır çıkabilir).
    // Toplam + ortalama artık count/_avg ile DB'de hesaplanır (doğru + hızlı). Kırılımlar (trend,
    // sentiment) hâlâ örneklem diziden gelir (görsel amaçlı, kabul edilebilir).
    const [qrCur, qrPrev, consCur, consPrev] = await Promise.all([
      prisma.feedback.aggregate({ where: { qrCode: { dealerId }, deletedAt: null, createdAt: { gte: startDate } }, _count: { _all: true }, _avg: { rating: true } }),
      prisma.feedback.aggregate({ where: { qrCode: { dealerId }, deletedAt: null, createdAt: { gte: prevStartDate, lt: startDate } }, _count: { _all: true }, _avg: { rating: true } }),
      prisma.consumptionReview.aggregate({ where: { consumption: { dealerId }, createdAt: { gte: startDate } }, _count: { _all: true }, _avg: { rating: true } }).catch(() => ({ _count: { _all: 0 }, _avg: { rating: null } })),
      prisma.consumptionReview.aggregate({ where: { consumption: { dealerId }, createdAt: { gte: prevStartDate, lt: startDate } }, _count: { _all: true }, _avg: { rating: true } }).catch(() => ({ _count: { _all: 0 }, _avg: { rating: null } })),
    ]);
    const curCount = (qrCur._count._all ?? 0) + (consCur._count._all ?? 0);
    const prevCount = (qrPrev._count._all ?? 0) + (consPrev._count._all ?? 0);
    const curSum = (qrCur._avg.rating ?? 0) * (qrCur._count._all ?? 0) + (consCur._avg.rating ?? 0) * (consCur._count._all ?? 0);
    const prevSum = (qrPrev._avg.rating ?? 0) * (qrPrev._count._all ?? 0) + (consPrev._avg.rating ?? 0) * (consPrev._count._all ?? 0);

    // Separate current and previous period feedbacks (QR + Consumption) — KIRILIMLAR için örneklem
    const allQRFeedbacks = qrFeedbacksFlat;
    const allConsumptionFeedbacks = consumptionReviews.map((r: any) => ({
      rating: r.rating,
      sentiment: r.rating >= 4 ? 'positive' : r.rating >= 3 ? 'neutral' : 'negative',
      topics: [],
      createdAt: r.createdAt,
    }));
    
    const allFeedbacks = [...allQRFeedbacks, ...allConsumptionFeedbacks];
    const currentFeedbacks = allFeedbacks.filter(f => new Date(f.createdAt) >= startDate);
    const prevFeedbacks = allFeedbacks.filter(
      f => new Date(f.createdAt) >= prevStartDate && new Date(f.createdAt) < startDate
    );
    
    // KESİN toplam/ortalama (DB agregasyonundan; cap'li diziden DEĞİL).
    const totalFeedbacks = curCount;
    const totalScans = totalScansAllQR;

    // Calculate growth rates (kesin sayılarla)
    const feedbackGrowth = prevCount > 0
      ? Math.round(((totalFeedbacks - prevCount) / prevCount) * 100)
      : totalFeedbacks > 0 ? 100 : 0;

    // Calculate average rating and change (kesin ağırlıklı ortalama)
    const avgRating = curCount > 0 ? curSum / curCount : 0;
    const prevAvgRating = prevCount > 0 ? prevSum / prevCount : 0;
    const ratingChange = prevAvgRating > 0 
      ? Number((avgRating - prevAvgRating).toFixed(1))
      : 0;

    // Sentiment breakdown
    const positiveCount = currentFeedbacks.filter(f => f.sentiment === 'positive').length;
    const neutralCount = currentFeedbacks.filter(f => f.sentiment === 'neutral' || !f.sentiment).length;
    const negativeCount = currentFeedbacks.filter(f => f.sentiment === 'negative').length;
    const totalSentiment = positiveCount + neutralCount + negativeCount || 1;

    // Rating distribution
    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    currentFeedbacks.forEach(f => {
      if (f.rating >= 1 && f.rating <= 5) {
        ratingCounts[f.rating as keyof typeof ratingCounts]++;
      }
    });
    const ratingTotal = totalFeedbacks || 1;
    const normalizedRatings = normalizePercentages([
      ratingCounts[5],
      ratingCounts[4],
      ratingCounts[3],
      ratingCounts[2],
      ratingCounts[1],
    ]);
    const ratingDistribution = {
      5: normalizedRatings[0],
      4: normalizedRatings[1],
      3: normalizedRatings[2],
      2: normalizedRatings[3],
      1: normalizedRatings[4],
    };

    // Daily trend data
    const dailyData = [];
    for (let i = daysCount - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      
      const dayFeedbacks = currentFeedbacks.filter(f => {
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

    // Weekly heatmap (hour x day of week)
    const heatmapData: number[][] = Array(7).fill(null).map(() => Array(24).fill(0));
    currentFeedbacks.forEach(f => {
      const date = new Date(f.createdAt);
      const dayOfWeek = date.getDay(); // 0 = Sunday
      const hour = date.getHours();
      heatmapData[dayOfWeek][hour]++;
    });

    // Hourly distribution
    const hourlyData = Array(24).fill(0);
    currentFeedbacks.forEach(f => {
      const hour = new Date(f.createdAt).getHours();
      hourlyData[hour]++;
    });

    // Day of week distribution
    const dayOfWeekData = [
      { day: 'Pazar', count: 0 },
      { day: 'Pazartesi', count: 0 },
      { day: 'Salı', count: 0 },
      { day: 'Çarşamba', count: 0 },
      { day: 'Perşembe', count: 0 },
      { day: 'Cuma', count: 0 },
      { day: 'Cumartesi', count: 0 },
    ];
    currentFeedbacks.forEach(f => {
      const dayOfWeek = new Date(f.createdAt).getDay();
      dayOfWeekData[dayOfWeek].count++;
    });

    // Top QR codes — önceden her qrCode için qrFeedbacksFlat.filter() (O(qr×fb),
    // 200 QR × binlerce feedback). Artık feedback'ler tek geçişte qrCodeId Map'ine
    // indirilir; her qrCode O(1) okur (O(qr+fb)).
    const qrStats = new Map<string, { count: number; ratingSum: number; positive: number }>();
    for (const f of qrFeedbacksFlat) {
      if (new Date(f.createdAt) < startDate) continue;
      const e = qrStats.get(f.qrCodeId) ?? { count: 0, ratingSum: 0, positive: 0 };
      e.count += 1;
      e.ratingSum += f.rating;
      if (f.sentiment === 'positive') e.positive += 1;
      qrStats.set(f.qrCodeId, e);
    }
    const topQRCodes = qrCodes
      .map((q) => {
        const s = qrStats.get(q.id) ?? { count: 0, ratingSum: 0, positive: 0 };
        const qrAvgRating = s.count > 0 ? s.ratingSum / s.count : 0;
        return {
          name: q.name,
          scans: q.scanCount,
          feedbacks: s.count,
          rating: qrAvgRating.toFixed(1),
          positiveRate: s.count > 0 ? Math.round((s.positive / s.count) * 100) : 0,
        };
      })
      .sort((a, b) => b.scans - a.scans)
      .slice(0, 5);

    // Extract topics from feedbacks
    const topicCounts: Record<string, { count: number; sentiments: string[] }> = {};
    currentFeedbacks.forEach(f => {
      const topics = Array.isArray(f.topics) ? f.topics : [];
      topics.forEach((topic: unknown) => {
        const topicStr = String(topic);
        if (!topicCounts[topicStr]) {
          topicCounts[topicStr] = { count: 0, sentiments: [] };
        }
        topicCounts[topicStr].count++;
        if (f.sentiment) {
          topicCounts[topicStr].sentiments.push(f.sentiment);
        }
      });
    });

    const topTopics = Object.entries(topicCounts)
      .map(([name, data]) => {
        const positiveSentiments = data.sentiments.filter(s => s === 'positive').length;
        const negativeSentiments = data.sentiments.filter(s => s === 'negative').length;
        let sentiment = 'neutral';
        if (positiveSentiments > negativeSentiments) sentiment = 'positive';
        else if (negativeSentiments > positiveSentiments) sentiment = 'negative';
        
        return { name, count: data.count, sentiment };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Conversion rate (feedbacks / scans)
    const conversionRate = totalScans > 0 
      ? ((totalFeedbacks / totalScans) * 100).toFixed(1)
      : '0';

    // Comparison metrics
    const positiveCurrent = Math.round((positiveCount / totalSentiment) * 100);
    const positivePrevious = prevFeedbacks.length > 0 
      ? Math.round((prevFeedbacks.filter(f => f.sentiment === 'positive').length / prevFeedbacks.length) * 100)
      : 0;
    
    const comparison = {
      feedbacks: {
        current: totalFeedbacks,
        previous: prevFeedbacks.length,
        change: feedbackGrowth,
      },
      rating: {
        current: avgRating.toFixed(1),
        previous: prevAvgRating.toFixed(1),
        change: ratingChange,
      },
      positive: {
        current: positiveCurrent,
        previous: positivePrevious,
        change: positiveCurrent - positivePrevious,
      },
    };

    // Peak time
    const peakHour = hourlyData.indexOf(Math.max(...hourlyData));
    const peakDay = dayOfWeekData.reduce((max, d) => d.count > max.count ? d : max, dayOfWeekData[0]);

    // GERÇEK yanıt oranı: dönem içinde bayi tarafından yanıtlanmış (dealerRepliedAt)
    // feedback / toplam feedback (önceden Math.random ile simüle ediliyordu).
    const [periodTotalForRate, periodRepliedForRate] = await Promise.all([
      prisma.feedback.count({
        where: { qrCode: { dealerId }, deletedAt: null, createdAt: { gte: startDate } },
      }),
      prisma.feedback.count({
        where: { qrCode: { dealerId }, deletedAt: null, createdAt: { gte: startDate }, dealerRepliedAt: { not: null } },
      }),
    ]);
    const responseRate = periodTotalForRate > 0
      ? Math.round((periodRepliedForRate / periodTotalForRate) * 100)
      : 0;

    const [positivePct, neutralPct, negativePct] = normalizePercentages([
      positiveCount,
      neutralCount,
      negativeCount,
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          totalFeedbacks,
          avgRating: avgRating.toFixed(1),
          totalScans,
          conversionRate,
          feedbackGrowth,
          ratingChange,
          responseRate,
          sentimentBreakdown: {
            positive: positivePct,
            neutral: neutralPct,
            negative: negativePct,
          },
          ratingDistribution,
          topQRCodes,
          topTopics,
          dailyData,
          heatmapData,
          hourlyData,
          dayOfWeekData,
          comparison,
          insights: {
            peakHour: `${peakHour}:00 - ${peakHour + 1}:00`,
            peakDay: peakDay.day,
            bestQR: topQRCodes[0]?.name || null,
            worstTopic: topTopics.find((t) => t.sentiment === 'negative')?.name || null,
          },
          // Consumption stats
          consumptionStats,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Analytics error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Analitik verileri yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

