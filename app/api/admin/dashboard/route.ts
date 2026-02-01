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
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, image: true, role: true, createdAt: true }
      }),
      prisma.feedback.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, text: true, rating: true, sentiment: true, createdAt: true,
          user: { select: { name: true } },
          qrCode: { select: { name: true, dealer: { select: { businessName: true } } } }
        }
      }),
      prisma.user.findMany({
        where: { role: 'DEALER' },
        take: 5,
        select: {
          id: true, businessName: true, name: true,
          qrCodes: {
            select: {
              _count: { select: { feedbacks: true } },
              feedbacks: { select: { rating: true } }
            }
          }
        }
      }),
      prisma.feedback.count({ where: { sentiment: 'positive' } }),
      prisma.feedback.count({ where: { sentiment: 'neutral' } }),
      prisma.feedback.count({ where: { sentiment: 'negative' } }),
      prisma.qRCode.aggregate({ _sum: { scanCount: true } }),
    ]);

    // Card system queries (with fallback)
    let cardStats = { total: 0, activated: 0, unused: 0, blocked: 0, consumptions: 0, reviews: 0 };
    let recentConsumptionReviews: any[] = [];
    
    try {
      const [totalCards, activatedCards, unusedCards, blockedCards, totalConsumptions, totalConsumptionReviews, consumptionReviews] = await Promise.all([
        (prisma as any).physicalCard.count(),
        (prisma as any).physicalCard.count({ where: { status: 'ACTIVATED' } }),
        (prisma as any).physicalCard.count({ where: { status: 'UNUSED' } }),
        (prisma as any).physicalCard.count({ where: { status: 'BLOCKED' } }),
        (prisma as any).consumption.count(),
        (prisma as any).consumptionReview.count(),
        (prisma as any).consumptionReview.findMany({
          take: 5,
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
      ]);
      
      cardStats = {
        total: totalCards,
        activated: activatedCards,
        unused: unusedCards,
        blocked: blockedCards,
        consumptions: totalConsumptions,
        reviews: totalConsumptionReviews,
      };
      recentConsumptionReviews = consumptionReviews;
    } catch (e) {
      console.log('Card system not available:', e);
    }

    // Calculate percentage changes
    const userChange = usersLastMonth > 0 
      ? Math.round(((usersThisMonth - usersLastMonth) / usersLastMonth) * 100)
      : usersThisMonth > 0 ? 100 : 0;
      
    const feedbackChange = feedbacksLastMonth > 0 
      ? Math.round(((feedbacksThisMonth - feedbacksLastMonth) / feedbacksLastMonth) * 100)
      : feedbacksThisMonth > 0 ? 100 : 0;

    const scans = totalScans._sum.scanCount || 0;

    // Format top dealers
    const formattedTopDealers = topDealers.map((dealer: any) => {
      const allFeedbacks = dealer.qrCodes.flatMap((qr: any) => qr.feedbacks);
      const totalFeedbackCount = allFeedbacks.length;
      const avgRating = totalFeedbackCount > 0
        ? (allFeedbacks.reduce((sum: number, f: any) => sum + f.rating, 0) / totalFeedbackCount).toFixed(1)
        : '0.0';
      
      return {
        id: dealer.id,
        name: dealer.businessName || dealer.name || 'İsimsiz İşletme',
        feedbacks: totalFeedbackCount,
        rating: parseFloat(avgRating),
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
    
    // Combine and sort all recent reviews
    const allRecentReviews = [...formattedRecentFeedbacks, ...formattedConsumptionReviews]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    // Total all reviews
    const totalAllReviews = totalFeedbacks + cardStats.reviews;

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
        change: feedbackChange,
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

    return NextResponse.json({
      success: true,
      stats,
      recentUsers,
      recentFeedbacks: allRecentReviews,
      topDealers: formattedTopDealers,
      sentiment: {
        positive: positiveFeedbacks,
        neutral: neutralFeedbacks,
        negative: negativeFeedbacks,
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
    });
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    return NextResponse.json(
      { error: 'Dashboard verileri getirilemedi' },
      { status: 500 }
    );
  }
}
