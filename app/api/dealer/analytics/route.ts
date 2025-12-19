import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const dealerId = session.user.id;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get dealer's QR codes
    const qrCodes = await prisma.qRCode.findMany({
      where: { dealerId },
      include: {
        feedbacks: {
          where: {
            createdAt: { gte: startDate },
          },
          select: {
            rating: true,
            sentiment: true,
            topics: true,
            createdAt: true,
          },
        },
        _count: {
          select: { feedbacks: true },
        },
      },
    });

    // Get all feedbacks in period
    const allFeedbacks = qrCodes.flatMap(q => q.feedbacks);
    const totalFeedbacks = allFeedbacks.length;
    const totalScans = qrCodes.reduce((acc, q) => acc + q.scanCount, 0);

    // Calculate average rating
    const avgRating = totalFeedbacks > 0
      ? allFeedbacks.reduce((acc, f) => acc + f.rating, 0) / totalFeedbacks
      : 0;

    // Sentiment breakdown
    const positiveCount = allFeedbacks.filter(f => f.sentiment === 'positive').length;
    const neutralCount = allFeedbacks.filter(f => f.sentiment === 'neutral' || !f.sentiment).length;
    const negativeCount = allFeedbacks.filter(f => f.sentiment === 'negative').length;
    const totalSentiment = positiveCount + neutralCount + negativeCount || 1;

    // Rating distribution
    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    allFeedbacks.forEach(f => {
      if (f.rating >= 1 && f.rating <= 5) {
        ratingCounts[f.rating as keyof typeof ratingCounts]++;
      }
    });
    const ratingTotal = totalFeedbacks || 1;
    const ratingDistribution = {
      5: Math.round((ratingCounts[5] / ratingTotal) * 100),
      4: Math.round((ratingCounts[4] / ratingTotal) * 100),
      3: Math.round((ratingCounts[3] / ratingTotal) * 100),
      2: Math.round((ratingCounts[2] / ratingTotal) * 100),
      1: Math.round((ratingCounts[1] / ratingTotal) * 100),
    };

    // Top QR codes
    const topQRCodes = qrCodes
      .map(q => {
        const qrFeedbacks = q.feedbacks;
        const qrAvgRating = qrFeedbacks.length > 0
          ? qrFeedbacks.reduce((acc, f) => acc + f.rating, 0) / qrFeedbacks.length
          : 0;
        return {
          name: q.name,
          scans: q.scanCount,
          feedbacks: qrFeedbacks.length,
          rating: qrAvgRating.toFixed(1),
        };
      })
      .sort((a, b) => b.scans - a.scans)
      .slice(0, 5);

    // Extract topics from feedbacks
    const topicCounts: Record<string, { count: number; sentiments: string[] }> = {};
    allFeedbacks.forEach(f => {
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

    return NextResponse.json({
      success: true,
      data: {
        totalFeedbacks,
        avgRating: avgRating.toFixed(1),
        totalScans,
        conversionRate,
        feedbackGrowth: 0, // Would need historical data to calculate
        ratingChange: 0,
        sentimentBreakdown: {
          positive: Math.round((positiveCount / totalSentiment) * 100),
          neutral: Math.round((neutralCount / totalSentiment) * 100),
          negative: Math.round((negativeCount / totalSentiment) * 100),
        },
        ratingDistribution,
        topQRCodes,
        topTopics,
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { success: false, error: 'Analitik verileri yüklenemedi' },
      { status: 500 }
    );
  }
}

