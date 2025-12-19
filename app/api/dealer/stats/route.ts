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
          take: 10,
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
    
    // Calculate average rating
    const avgRating = totalFeedbacks > 0
      ? allFeedbacks.reduce((acc, f) => acc + f.rating, 0) / totalFeedbacks
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

    // Recent feedbacks with QR info
    const recentFeedbacks = await prisma.feedback.findMany({
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
      .slice(0, 3)
      .map(q => ({
        id: q.id,
        name: q.name,
        code: q.code,
        scans: q.scanCount,
        feedbacks: q._count.feedbacks,
      }));

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalFeedbacks,
          avgRating: avgRating.toFixed(1),
          totalQRCodes,
          activeQRCodes,
          totalScans,
        },
        sentimentData: sentimentPercentage,
        recentFeedbacks: recentFeedbacks.map(f => ({
          id: f.id,
          rating: f.rating,
          text: f.text,
          sentiment: f.sentiment,
          createdAt: f.createdAt,
          qrName: f.qrCode.name,
          userName: f.user?.name || 'Anonim',
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

