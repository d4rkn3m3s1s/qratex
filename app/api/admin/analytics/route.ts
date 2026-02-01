import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
        select: {
          id: true, businessName: true, name: true,
          qrCodes: {
            select: {
              _count: { select: { feedbacks: true } },
              feedbacks: { select: { rating: true, sentiment: true } },
            },
          },
        },
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
        (prisma as any).physicalCard.count(),
        (prisma as any).physicalCard.count({ where: { status: 'ACTIVATED' } }),
        (prisma as any).physicalCard.count({ where: { status: 'UNUSED' } }),
        (prisma as any).physicalCard.count({ where: { status: 'BLOCKED' } }),
        (prisma as any).consumption.count(),
        (prisma as any).consumptionReview.count(),
        (prisma as any).consumptionReview.findMany({
          where: { createdAt: { gte: startDate } },
          select: { rating: true, createdAt: true },
        }),
        (prisma as any).consumption.findMany({
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
      console.log('Card system not available');
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
    const formattedTopDealers = topDealers.map((dealer: any) => {
      const allFeedbacks = dealer.qrCodes.flatMap((qr: any) => qr.feedbacks);
      const totalFeedbackCount = allFeedbacks.length;
      const avgDealerRating = totalFeedbackCount > 0
        ? allFeedbacks.reduce((sum: number, f: any) => sum + f.rating, 0) / totalFeedbackCount
        : 0;
      const positiveRate = totalFeedbackCount > 0
        ? Math.round((allFeedbacks.filter((f: any) => f.sentiment === 'positive').length / totalFeedbackCount) * 100)
        : 0;
      
      return {
        id: dealer.id,
        name: dealer.businessName || dealer.name || 'İsimsiz İşletme',
        feedbackCount: totalFeedbackCount,
        avgRating: Number(avgDealerRating.toFixed(1)),
        positiveRate,
      };
    }).sort((a: any, b: any) => b.feedbackCount - a.feedbackCount).slice(0, 5);

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

    return NextResponse.json({
      success: true,
      data: {
        // Main stats
        totalUsers,
        totalFeedbacks: totalFeedbacks + cardStats.reviews,
        totalQRCodes,
        avgRating: Number(avgRating.toFixed(1)),
        userGrowth,
        feedbackGrowth,
        totalScans: totalScansResult._sum.scanCount || 0,
        activeQRCodes,
        
        // Sentiment
        sentimentBreakdown: {
          positive: Math.round((positiveFeedbacks / totalSentiment) * 100),
          neutral: Math.round((neutralFeedbacks / totalSentiment) * 100),
          negative: Math.round((negativeFeedbacks / totalSentiment) * 100),
        },
        
        // Rating distribution
        ratingDistribution,
        
        // Trends
        dailyData,
        heatmapData,
        
        // Dealers
        topDealers: formattedTopDealers,
        
        // Activity
        recentActivity: formattedActivity,
        
        // Card system
        cardStats,
        
        // Comparison
        comparison,
        
        // User distribution
        roleDistribution,
        
        // Totals
        totals: {
          users: totalUsers,
          feedbacks: totalFeedbacks,
          qrCodes: totalQRCodes,
          activeQRCodes,
          scans: totalScansResult._sum.scanCount || 0,
          ...cardStats,
        },
      },
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: 'Analitik verileri getirilemedi' }, { status: 500 });
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
