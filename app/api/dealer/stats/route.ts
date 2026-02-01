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
        _count: { select: { feedbacks: true } },
        feedbacks: {
          select: { rating: true, sentiment: true, createdAt: true, text: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Get consumption data (with fallback)
    let consumptionData = {
      consumptions: [] as any[],
      totalConsumptions: 0,
      totalCustomers: 0,
      consumptionReviewCount: 0,
      recentConsumptionReviews: [] as any[],
    };
    
    try {
      const [consumptions, consumptionReviews, uniqueCustomers] = await Promise.all([
        (prisma as any).consumption.findMany({
          where: { dealerId },
          include: {
            customer: { select: { id: true, name: true, image: true } },
            product: { select: { name: true, category: { select: { name: true, icon: true } } } },
            review: { select: { id: true, rating: true, text: true, createdAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        (prisma as any).consumptionReview.findMany({
          where: { consumption: { dealerId } },
          include: {
            customer: { select: { name: true, image: true } },
            consumption: { select: { product: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        (prisma as any).consumption.groupBy({
          by: ['customerId'],
          where: { dealerId },
        }),
      ]);
      
      consumptionData = {
        consumptions,
        totalConsumptions: consumptions.length,
        totalCustomers: uniqueCustomers.length,
        consumptionReviewCount: consumptions.filter((c: any) => c.review).length,
        recentConsumptionReviews: consumptionReviews,
      };
    } catch (e) {
      console.log('Consumption data not available:', e);
    }

    // Calculate QR stats
    const totalQRCodes = qrCodes.length;
    const activeQRCodes = qrCodes.filter(q => q.isActive).length;
    const totalScans = qrCodes.reduce((acc, q) => acc + q.scanCount, 0);
    
    // Get all feedbacks (QR + Consumption)
    const allQRFeedbacks = qrCodes.flatMap(q => q.feedbacks);
    const allConsumptionReviews = consumptionData.consumptions
      .filter((c: any) => c.review)
      .map((c: any) => ({
        rating: c.review.rating,
        sentiment: c.review.rating >= 4 ? 'positive' : c.review.rating >= 3 ? 'neutral' : 'negative',
        createdAt: c.review.createdAt,
        text: c.review.text,
      }));
    
    const allFeedbacks = [...allQRFeedbacks, ...allConsumptionReviews];
    const totalFeedbacks = allFeedbacks.length;
    
    // Calculate feedbacks in periods
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
      
    const prevAvgRating = previousPeriodFeedbacks.length > 0
      ? previousPeriodFeedbacks.reduce((acc, f) => acc + f.rating, 0) / previousPeriodFeedbacks.length
      : 0;
    const ratingChange = prevAvgRating > 0 ? Number((avgRating - prevAvgRating).toFixed(1)) : 0;

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
    
    // Weekly chart data
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

    // Recent QR feedbacks
    const recentFeedbacksData = await prisma.feedback.findMany({
      where: { qrCode: { dealerId } },
      include: {
        qrCode: { select: { name: true } },
        user: { select: { name: true, image: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Top QR codes
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
      ...recentFeedbacksData.map(f => ({
        id: f.id,
        rating: f.rating,
        text: f.text,
        sentiment: f.sentiment,
        createdAt: f.createdAt,
        qrName: f.qrCode.name,
        userName: f.user?.name || 'Anonim',
        userImage: f.user?.image,
        type: 'qr' as const,
      })),
      ...recentConsumptionReviewsFormatted,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

    const pendingReviews = consumptionData.totalConsumptions - consumptionData.consumptionReviewCount;

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
          conversionRate: totalScans > 0 ? ((totalFeedbacks / totalScans) * 100).toFixed(1) : '0',
          totalConsumptions: consumptionData.totalConsumptions,
          totalCustomers: consumptionData.totalCustomers,
          consumptionReviewCount: consumptionData.consumptionReviewCount,
          pendingReviews,
        },
        performance: { score: performanceScore, level: performanceLevel, color: performanceColor },
        sentimentData: sentimentPercentage,
        weeklyData,
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
    });
  } catch (error) {
    console.error('Dealer stats error:', error);
    return NextResponse.json({ success: false, error: 'İstatistikler yüklenemedi' }, { status: 500 });
  }
}
