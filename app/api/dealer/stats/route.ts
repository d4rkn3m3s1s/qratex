import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const dealerId = session.user.id;
    
    // Date ranges for comparison
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prev30Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get dealer's QR codes
    const qrCodes = await prisma.qRCode.findMany({
      where: { dealerId },
      include: {
        _count: {
          select: { feedbacks: true },
        },
        feedbacks: {
          select: {
            rating: true,
            sentiment: true,
            createdAt: true,
            text: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Calculate stats
    const totalQRCodes = qrCodes.length;
    const activeQRCodes = qrCodes.filter(q => q.isActive).length;
    const totalScans = qrCodes.reduce((acc, q) => acc + q.scanCount, 0);
    
    // Get all feedbacks for this dealer
    const allFeedbacks = qrCodes.flatMap(q => q.feedbacks);
    const totalFeedbacks = allFeedbacks.length;
    
    // Calculate feedbacks in current and previous periods
    const currentPeriodFeedbacks = allFeedbacks.filter(f => new Date(f.createdAt) >= last30Days);
    const previousPeriodFeedbacks = allFeedbacks.filter(
      f => new Date(f.createdAt) >= prev30Days && new Date(f.createdAt) < last30Days
    );
    const recentFeedbacks7d = allFeedbacks.filter(f => new Date(f.createdAt) >= last7Days);
    
    // Calculate growth rates
    const feedbackGrowth = previousPeriodFeedbacks.length > 0
      ? Math.round(((currentPeriodFeedbacks.length - previousPeriodFeedbacks.length) / previousPeriodFeedbacks.length) * 100)
      : currentPeriodFeedbacks.length > 0 ? 100 : 0;
    
    // Calculate average rating
    const avgRating = totalFeedbacks > 0
      ? allFeedbacks.reduce((acc, f) => acc + f.rating, 0) / totalFeedbacks
      : 0;
      
    // Previous period rating
    const prevAvgRating = previousPeriodFeedbacks.length > 0
      ? previousPeriodFeedbacks.reduce((acc, f) => acc + f.rating, 0) / previousPeriodFeedbacks.length
      : 0;
    const ratingChange = prevAvgRating > 0 
      ? Number((avgRating - prevAvgRating).toFixed(1))
      : 0;

    // Sentiment breakdown
    const sentimentData = {
      positive: allFeedbacks.filter(f => f.sentiment === 'positive').length,
      neutral: allFeedbacks.filter(f => f.sentiment === 'neutral' || !f.sentiment).length,
      negative: allFeedbacks.filter(f => f.sentiment === 'negative').length,
    };

    const totalSentiment = sentimentData.positive + sentimentData.neutral + sentimentData.negative || 1;
    const sentimentPercentage = {
      positive: Math.round((sentimentData.positive / totalSentiment) * 100),
      neutral: Math.round((sentimentData.neutral / totalSentiment) * 100),
      negative: Math.round((sentimentData.negative / totalSentiment) * 100),
    };
    
    // Weekly chart data (last 7 days)
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      
      const dayFeedbacks = allFeedbacks.filter(f => {
        const fDate = new Date(f.createdAt);
        return fDate >= dayStart && fDate <= dayEnd;
      });
      
      weeklyData.push({
        day: dayStart.toLocaleDateString('tr-TR', { weekday: 'short' }),
        feedbacks: dayFeedbacks.length,
        avgRating: dayFeedbacks.length > 0 
          ? Number((dayFeedbacks.reduce((acc, f) => acc + f.rating, 0) / dayFeedbacks.length).toFixed(1))
          : 0,
      });
    }

    // Recent feedbacks with QR info
    const recentFeedbacksData = await prisma.feedback.findMany({
      where: {
        qrCode: {
          dealerId,
        },
      },
      include: {
        qrCode: {
          select: { name: true },
        },
        user: {
          select: { name: true, image: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Top QR codes by scans
    const topQRCodes = qrCodes
      .sort((a, b) => b.scanCount - a.scanCount)
      .slice(0, 6)
      .map(q => {
        const qrFeedbacks = q.feedbacks;
        const qrAvgRating = qrFeedbacks.length > 0
          ? qrFeedbacks.reduce((acc, f) => acc + f.rating, 0) / qrFeedbacks.length
          : 0;
        return {
          id: q.id,
          name: q.name,
          code: q.code,
          scans: q.scanCount,
          feedbacks: q._count.feedbacks,
          avgRating: qrAvgRating.toFixed(1),
          isActive: q.isActive,
        };
      });
      
    // Performance score (0-100)
    const ratingScore = (avgRating / 5) * 40; // Max 40 points
    const engagementScore = totalScans > 0 ? Math.min((totalFeedbacks / totalScans) * 100, 30) : 0; // Max 30 points
    const sentimentScore = sentimentPercentage.positive * 0.3; // Max 30 points
    const performanceScore = Math.round(ratingScore + engagementScore + sentimentScore);
    
    // Performance level
    let performanceLevel = 'Başlangıç';
    let performanceColor = 'gray';
    if (performanceScore >= 80) { performanceLevel = 'Mükemmel'; performanceColor = 'emerald'; }
    else if (performanceScore >= 60) { performanceLevel = 'Çok İyi'; performanceColor = 'green'; }
    else if (performanceScore >= 40) { performanceLevel = 'İyi'; performanceColor = 'yellow'; }
    else if (performanceScore >= 20) { performanceLevel = 'Gelişiyor'; performanceColor = 'orange'; }

    return NextResponse.json({
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
          weeklyFeedbacks: recentFeedbacks7d.length,
          conversionRate: totalScans > 0 
            ? ((totalFeedbacks / totalScans) * 100).toFixed(1)
            : '0',
        },
        performance: {
          score: performanceScore,
          level: performanceLevel,
          color: performanceColor,
        },
        sentimentData: sentimentPercentage,
        weeklyData,
        recentFeedbacks: recentFeedbacksData.map(f => ({
          id: f.id,
          rating: f.rating,
          text: f.text,
          sentiment: f.sentiment,
          createdAt: f.createdAt,
          qrName: f.qrCode.name,
          userName: f.user?.name || 'Anonim',
          userImage: f.user?.image,
        })),
        qrCodes: topQRCodes,
      },
    });
  } catch (error) {
    console.error('Dealer stats error:', error);
    return NextResponse.json(
      { success: false, error: 'İstatistikler yüklenemedi' },
      { status: 500 }
    );
  }
}

