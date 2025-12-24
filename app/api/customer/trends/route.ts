import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Geri bildirimleri günlük bazda grupla (son 30 gün)
    const feedbacks = await prisma.feedback.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo }
      },
      select: {
        createdAt: true,
        rating: true,
        sentiment: true,
      },
      orderBy: { createdAt: 'asc' }
    });

    // Günlük feedback sayıları
    const feedbackByDay: Record<string, number> = {};
    const ratingByDay: Record<string, { sum: number; count: number }> = {};
    const sentimentByDay: Record<string, { positive: number; negative: number; neutral: number }> = {};

    feedbacks.forEach(fb => {
      const day = fb.createdAt.toISOString().split('T')[0];
      
      // Feedback sayısı
      feedbackByDay[day] = (feedbackByDay[day] || 0) + 1;
      
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

    // Puan geçmişi (son işlemler) - activities tablosu yerine hesaplamalı
    // Gerçek uygulamada activities veya point_history tablosu kullanılır
    const pointsTrend: { date: string; points: number }[] = [];
    let cumulativePoints = 0;
    const pointsPerFeedback = 10; // Varsayılan puan
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const day = date.toISOString().split('T')[0];
      
      const dayFeedbacks = feedbackByDay[day] || 0;
      cumulativePoints += dayFeedbacks * pointsPerFeedback;
      
      pointsTrend.push({
        date: day,
        points: cumulativePoints,
      });
    }

    // Rozet kazanımları
    const badges = await prisma.badge.findMany({
      where: {
        users: { some: { id: userId } }
      },
      select: {
        id: true,
        name: true,
        icon: true,
        rarity: true,
        createdAt: true,
      }
    });

    // Haftalık karşılaştırma
    const thisWeekFeedbacks = feedbacks.filter(f => f.createdAt >= sevenDaysAgo).length;
    const lastWeekStart = new Date(sevenDaysAgo);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekFeedbacks = feedbacks.filter(f => 
      f.createdAt >= lastWeekStart && f.createdAt < sevenDaysAgo
    ).length;

    const feedbackChange = lastWeekFeedbacks > 0 
      ? ((thisWeekFeedbacks - lastWeekFeedbacks) / lastWeekFeedbacks * 100).toFixed(1)
      : thisWeekFeedbacks > 0 ? '+100' : '0';

    // Duygu analizi özeti
    const totalSentiments = feedbacks.reduce((acc, fb) => {
      if (fb.sentiment === 'positive') acc.positive += 1;
      else if (fb.sentiment === 'negative') acc.negative += 1;
      else acc.neutral += 1;
      return acc;
    }, { positive: 0, negative: 0, neutral: 0 });

    const sentimentScore = feedbacks.length > 0
      ? ((totalSentiments.positive - totalSentiments.negative) / feedbacks.length * 100).toFixed(0)
      : '0';

    // En aktif günler
    const dayOfWeekCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    feedbacks.forEach(fb => {
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
    feedbacks.forEach(fb => {
      const hour = fb.createdAt.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    const peakHourFormatted = peakHour ? `${peakHour[0]}:00 - ${parseInt(peakHour[0]) + 1}:00` : 'Veri yok';

    // Seviye ilerleme tahmini
    const currentXP = Number(user.xp) || 0;
    const xpPerLevel = 100;
    const xpToNextLevel = xpPerLevel - (currentXP % xpPerLevel);
    const avgDailyXP = feedbacks.length > 0 ? (currentXP / 30) : 0;
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

    return NextResponse.json({
      summary: {
        totalFeedbacks: user._count.feedbacks,
        totalBadges: user._count.badges,
        totalRewards: user._count.rewards,
        currentPoints: Number(user.points) || 0,
        currentXP: currentXP,
        currentLevel: user.level,
        memberSince: user.createdAt,
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
        total: feedbacks.length,
      },
      insights: {
        peakHour: peakHourFormatted,
        currentStreak,
        maxStreak,
        daysToNextLevel,
        xpToNextLevel,
        avgDailyFeedbacks: (feedbacks.length / 30).toFixed(1),
      },
      badges: badges.slice(0, 5),
    });
  } catch (error) {
    console.error('Trends API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

