import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { getPointsMatrix } from '@/lib/points-rules';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const userId = session.user.id;

    // REDIS CACHE: müşteri trend sayfası (çok sayıda count/findMany) 30s cache'lenir (kullanıcı
    // başına). Hit'te sorgular atlanır. Redis yoksa cache-miss gibi → davranış aynı.
    const { redisGetJson, redisSetJson } = await import('@/lib/redis');
    const trendsCacheKey = `customer-trends:${userId}`;
    const cachedTrends = await redisGetJson<object>(trendsCacheKey);
    if (cachedTrends) {
      return NextResponse.json(cachedTrends, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Son 30 günlük veri için tarih aralığı
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Kullanıcı bilgilerini al
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        points: true,
        xp: true,
        level: true,
        createdAt: true,
        _count: {
          select: {
            feedbacks: true,
            badges: true,
            rewards: true,
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const lastWeekStart = new Date(sevenDaysAgo);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const TRENDS_ROW_CAP = 5000;

    const [
      matrix,
      feedbacks,
      fbThisWeek,
      fbLastWeek,
      fbCount30d,
    ] = await Promise.all([
      getPointsMatrix(),
      prisma.feedback.findMany({
        where: {
          userId,
          createdAt: { gte: thirtyDaysAgo },
        },
        select: {
          createdAt: true,
          rating: true,
          sentiment: true,
        },
        orderBy: { createdAt: 'asc' },
        take: TRENDS_ROW_CAP,
      }),
      prisma.feedback.count({
        where: { userId, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.feedback.count({
        where: { userId, createdAt: { gte: lastWeekStart, lt: sevenDaysAgo } },
      }),
      prisma.feedback.count({
        where: { userId, createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);
    
    const [
      consumptionReviews,
      consumptionCount,
      thisWeekConsumption,
      lastWeekConsumption,
      consumptionReviewCount30d,
    ] = await Promise.all([
      prisma.consumptionReview.findMany({
        where: { customerId: userId, createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, rating: true },
        orderBy: { createdAt: 'asc' },
        take: TRENDS_ROW_CAP,
      }),
      prisma.consumption.count({ where: { customerId: userId } }),
      prisma.consumptionReview.count({
        where: { customerId: userId, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.consumptionReview.count({
        where: { customerId: userId, createdAt: { gte: lastWeekStart, lt: sevenDaysAgo } },
      }),
      prisma.consumptionReview.count({
        where: { customerId: userId, createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);
    
    // Tüm yorumları birleştir (QR + Consumption)
    const allFeedbacks: Array<{
      createdAt: Date;
      rating: number | null;
      sentiment: string | null;
      type: 'qr' | 'consumption';
    }> = [
      ...feedbacks.map(f => ({
        createdAt: f.createdAt,
        rating: f.rating,
        sentiment: f.sentiment,
        type: 'qr' as const,
      })),
      ...consumptionReviews.map((r) => {
        const rating = r.rating ?? 0;
        return {
          createdAt: new Date(r.createdAt),
          rating: r.rating,
          sentiment: rating >= 4 ? 'positive' : rating >= 3 ? 'neutral' : 'negative',
          type: 'consumption' as const,
        };
      }),
    ];

    // Günlük feedback sayıları (QR + Consumption birleşik)
    const feedbackByDay: Record<string, number> = {};
    const pointsByDay: Record<string, number> = {};
    const ratingByDay: Record<string, { sum: number; count: number }> = {};
    const sentimentByDay: Record<string, { positive: number; negative: number; neutral: number }> = {};

    allFeedbacks.forEach(fb => {
      const day = fb.createdAt.toISOString().split('T')[0];
      
      // Feedback sayısı
      feedbackByDay[day] = (feedbackByDay[day] || 0) + 1;
      const pointsForEvent = fb.type === 'consumption' ? matrix.consumptionReview.base.points : matrix.feedback.base.points;
      pointsByDay[day] = (pointsByDay[day] || 0) + pointsForEvent;
      
      // Rating ortalaması
      if (fb.rating) {
        if (!ratingByDay[day]) {
          ratingByDay[day] = { sum: 0, count: 0 };
        }
        ratingByDay[day].sum += fb.rating;
        ratingByDay[day].count += 1;
      }

      // Sentiment dağılımı
      if (!sentimentByDay[day]) {
        sentimentByDay[day] = { positive: 0, negative: 0, neutral: 0 };
      }
      if (fb.sentiment === 'positive') sentimentByDay[day].positive += 1;
      else if (fb.sentiment === 'negative') sentimentByDay[day].negative += 1;
      else sentimentByDay[day].neutral += 1;
    });

    // Son 30 gün için boş günleri doldur
    const feedbackTrend: { date: string; count: number; avgRating: number | null }[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const day = date.toISOString().split('T')[0];
      
      const rating = ratingByDay[day];
      feedbackTrend.push({
        date: day,
        count: feedbackByDay[day] || 0,
        avgRating: rating ? rating.sum / rating.count : null,
      });
    }

    // Puan geçmişi (matrix tabanlı yaklaşık hesap)
    const pointsTrend: { date: string; points: number }[] = [];
    let cumulativePoints = 0;
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const day = date.toISOString().split('T')[0];
      
      cumulativePoints += pointsByDay[day] || 0;
      
      pointsTrend.push({
        date: day,
        points: cumulativePoints,
      });
    }

    // Rozet kazanımları
    const badges = await prisma.badge.findMany({
      where: {
        users: { some: { id: userId } },
      },
      select: {
        id: true,
        name: true,
        icon: true,
        rarity: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Haftalık karşılaştırma (QR + Consumption, tam sayım)
    const thisWeekFeedbacks = fbThisWeek + thisWeekConsumption;
    const lastWeekFeedbacks = fbLastWeek + lastWeekConsumption;

    const feedbackChange = lastWeekFeedbacks > 0 
      ? ((thisWeekFeedbacks - lastWeekFeedbacks) / lastWeekFeedbacks * 100).toFixed(1)
      : thisWeekFeedbacks > 0 ? '+100' : '0';

    // Duygu analizi özeti
    const totalSentiments = allFeedbacks.reduce((acc, fb) => {
      if (fb.sentiment === 'positive') acc.positive += 1;
      else if (fb.sentiment === 'negative') acc.negative += 1;
      else acc.neutral += 1;
      return acc;
    }, { positive: 0, negative: 0, neutral: 0 });

    const sentimentScore = allFeedbacks.length > 0
      ? ((totalSentiments.positive - totalSentiments.negative) / allFeedbacks.length * 100).toFixed(0)
      : '0';

    // En aktif günler
    const dayOfWeekCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    allFeedbacks.forEach(fb => {
      const dayOfWeek = fb.createdAt.getDay();
      dayOfWeekCounts[dayOfWeek] += 1;
    });

    const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const activityByDayOfWeek = Object.entries(dayOfWeekCounts).map(([day, count]) => ({
      day: dayNames[parseInt(day)],
      count,
    }));

    // En yüksek aktivite saati
    const hourCounts: Record<number, number> = {};
    allFeedbacks.forEach(fb => {
      const hour = fb.createdAt.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    const peakHourFormatted = peakHour ? `${peakHour[0]}:00 - ${parseInt(peakHour[0]) + 1}:00` : 'Veri yok';

    // Seviye ilerleme tahmini
    const currentXP = Number(user.xp) || 0;
    const xpPerLevel = 1000;
    const xpToNextLevel = xpPerLevel - (currentXP % xpPerLevel);
    const combined30d = fbCount30d + consumptionReviewCount30d;
    const avgDailyXP = combined30d > 0 ? currentXP / 30 : 0;
    const daysToNextLevel = avgDailyXP > 0 ? Math.ceil(xpToNextLevel / avgDailyXP) : null;

    // Streak hesaplama (ardışık gün sayısı)
    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;
    
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const day = date.toISOString().split('T')[0];
      
      if (feedbackByDay[day] && feedbackByDay[day] > 0) {
        tempStreak++;
        if (i === 0 || currentStreak > 0) currentStreak = tempStreak;
        maxStreak = Math.max(maxStreak, tempStreak);
      } else {
        if (i === 0) currentStreak = 0;
        tempStreak = 0;
      }
    }

    const trendsPayload = {
      summary: {
        totalFeedbacks: user._count.feedbacks + consumptionReviewCount30d,
        totalBadges: user._count.badges,
        totalRewards: user._count.rewards,
        currentPoints: Number(user.points) || 0,
        currentXP: currentXP,
        currentLevel: user.level,
        memberSince: user.createdAt,
        // Additional consumption stats
        totalConsumptions: consumptionCount,
        totalConsumptionReviews: consumptionReviewCount30d,
      },
      trends: {
        feedbackTrend,
        pointsTrend,
        activityByDayOfWeek,
      },
      comparisons: {
        thisWeekFeedbacks,
        lastWeekFeedbacks,
        feedbackChange: `${Number(feedbackChange) >= 0 ? '+' : ''}${feedbackChange}%`,
      },
      sentiment: {
        ...totalSentiments,
        score: sentimentScore,
        total: allFeedbacks.length,
      },
      insights: {
        peakHour: peakHourFormatted,
        currentStreak,
        maxStreak,
        daysToNextLevel,
        xpToNextLevel,
        avgDailyFeedbacks: (combined30d / 30).toFixed(1),
      },
      badges: badges.slice(0, 5),
    };
    await redisSetJson(trendsCacheKey, trendsPayload, 30); // Redis yoksa sessizce geçer
    return NextResponse.json(trendsPayload, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Trends API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

