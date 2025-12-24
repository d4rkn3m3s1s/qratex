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
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Parallel queries for better performance
    const [
      // Total counts
      totalUsers,
      totalFeedbacks,
      totalQRCodes,
      activeQRCodes,
      
      // Users this month vs last month
      usersThisMonth,
      usersLastMonth,
      
      // Feedbacks this month vs last month
      feedbacksThisMonth,
      feedbacksLastMonth,
      
      // Recent users
      recentUsers,
      
      // Recent feedbacks
      recentFeedbacks,
      
      // Top dealers by feedback count
      topDealers,
      
      // Sentiment distribution
      positiveFeedbacks,
      neutralFeedbacks,
      negativeFeedbacks,
      
      // Total scans
      totalScans,
    ] = await Promise.all([
      // Total counts
      prisma.user.count(),
      prisma.feedback.count(),
      prisma.qRCode.count(),
      prisma.qRCode.count({ where: { isActive: true } }),
      
      // Users this month
      prisma.user.count({
        where: { createdAt: { gte: thirtyDaysAgo } }
      }),
      // Users last month
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000),
            lt: thirtyDaysAgo
          }
        }
      }),
      
      // Feedbacks this month
      prisma.feedback.count({
        where: { createdAt: { gte: thirtyDaysAgo } }
      }),
      // Feedbacks last month
      prisma.feedback.count({
        where: {
          createdAt: {
            gte: new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000),
            lt: thirtyDaysAgo
          }
        }
      }),
      
      // Recent users (last 10)
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          createdAt: true,
        }
      }),
      
      // Recent feedbacks (last 5)
      prisma.feedback.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          text: true,
          rating: true,
          sentiment: true,
          createdAt: true,
          user: {
            select: { name: true }
          },
          qrCode: {
            select: { 
              name: true,
              dealer: {
                select: { businessName: true }
              }
            }
          }
        }
      }),
      
      // Top dealers
      prisma.user.findMany({
        where: { role: 'DEALER' },
        take: 5,
        select: {
          id: true,
          businessName: true,
          name: true,
          qrCodes: {
            select: {
              _count: {
                select: { feedbacks: true }
              },
              feedbacks: {
                select: { rating: true }
              }
            }
          }
        }
      }),
      
      // Sentiment counts
      prisma.feedback.count({ where: { sentiment: 'positive' } }),
      prisma.feedback.count({ where: { sentiment: 'neutral' } }),
      prisma.feedback.count({ where: { sentiment: 'negative' } }),
      
      // Total scans
      prisma.qRCode.aggregate({
        _sum: { scanCount: true }
      }),
    ]);

    // Calculate percentage changes
    const userChange = usersLastMonth > 0 
      ? Math.round(((usersThisMonth - usersLastMonth) / usersLastMonth) * 100)
      : usersThisMonth > 0 ? 100 : 0;
      
    const feedbackChange = feedbacksLastMonth > 0 
      ? Math.round(((feedbacksThisMonth - feedbacksLastMonth) / feedbacksLastMonth) * 100)
      : feedbacksThisMonth > 0 ? 100 : 0;

    // Calculate conversion rate (feedbacks / scans)
    const scans = totalScans._sum.scanCount || 0;
    const conversionRate = scans > 0 
      ? Math.round((totalFeedbacks / scans) * 100) 
      : 0;

    // Format top dealers
    const formattedTopDealers = topDealers.map(dealer => {
      const allFeedbacks = dealer.qrCodes.flatMap(qr => qr.feedbacks);
      const totalFeedbackCount = allFeedbacks.length;
      const avgRating = totalFeedbackCount > 0
        ? (allFeedbacks.reduce((sum, f) => sum + f.rating, 0) / totalFeedbackCount).toFixed(1)
        : '0.0';
      
      return {
        id: dealer.id,
        name: dealer.businessName || dealer.name || 'İsimsiz İşletme',
        feedbacks: totalFeedbackCount,
        rating: parseFloat(avgRating),
      };
    }).sort((a, b) => b.feedbacks - a.feedbacks);

    // Format recent feedbacks
    const formattedRecentFeedbacks = recentFeedbacks.map(f => ({
      id: f.id,
      text: f.text || 'Yorum yapılmadı',
      rating: f.rating,
      sentiment: f.sentiment || 'neutral',
      createdAt: f.createdAt,
      userName: f.user?.name || 'Anonim',
      businessName: f.qrCode.dealer?.businessName || f.qrCode.name,
    }));

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
        title: 'Geri Bildirim',
        value: totalFeedbacks,
        change: feedbackChange,
        icon: 'MessageSquare',
        iconColor: 'text-green-500',
        iconBgColor: 'bg-green-500/10',
      },
      {
        title: 'Aktif QR Kod',
        value: activeQRCodes,
        change: Math.round((activeQRCodes / Math.max(totalQRCodes, 1)) * 100),
        icon: 'QrCode',
        iconColor: 'text-purple-500',
        iconBgColor: 'bg-purple-500/10',
      },
      {
        title: 'Dönüşüm Oranı',
        value: `${conversionRate}%`,
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
      recentFeedbacks: formattedRecentFeedbacks,
      topDealers: formattedTopDealers,
      sentiment: {
        positive: positiveFeedbacks,
        neutral: neutralFeedbacks,
        negative: negativeFeedbacks,
      },
      totals: {
        users: totalUsers,
        feedbacks: totalFeedbacks,
        qrCodes: totalQRCodes,
        activeQRCodes,
        scans,
      }
    });
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    return NextResponse.json(
      { error: 'Dashboard verileri getirilemedi' },
      { status: 500 }
    );
  }
}



