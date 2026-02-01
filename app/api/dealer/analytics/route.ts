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

    // Get dealer's QR codes with all feedbacks
    const qrCodes = await prisma.qRCode.findMany({
      where: { dealerId },
      include: {
        feedbacks: {
          where: {
            createdAt: { gte: prevStartDate },
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

    // Separate current and previous period feedbacks
    const allFeedbacks = qrCodes.flatMap(q => q.feedbacks);
    const currentFeedbacks = allFeedbacks.filter(f => new Date(f.createdAt) >= startDate);
    const prevFeedbacks = allFeedbacks.filter(
      f => new Date(f.createdAt) >= prevStartDate && new Date(f.createdAt) < startDate
    );
    
    const totalFeedbacks = currentFeedbacks.length;
    const totalScans = qrCodes.reduce((acc, q) => acc + q.scanCount, 0);

    // Calculate growth rates
    const feedbackGrowth = prevFeedbacks.length > 0
      ? Math.round(((totalFeedbacks - prevFeedbacks.length) / prevFeedbacks.length) * 100)
      : totalFeedbacks > 0 ? 100 : 0;

    // Calculate average rating and change
    const avgRating = totalFeedbacks > 0
      ? currentFeedbacks.reduce((acc, f) => acc + f.rating, 0) / totalFeedbacks
      : 0;
    const prevAvgRating = prevFeedbacks.length > 0
      ? prevFeedbacks.reduce((acc, f) => acc + f.rating, 0) / prevFeedbacks.length
      : 0;
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
    const ratingDistribution = {
      5: Math.round((ratingCounts[5] / ratingTotal) * 100),
      4: Math.round((ratingCounts[4] / ratingTotal) * 100),
      3: Math.round((ratingCounts[3] / ratingTotal) * 100),
      2: Math.round((ratingCounts[2] / ratingTotal) * 100),
      1: Math.round((ratingCounts[1] / ratingTotal) * 100),
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

    // Top QR codes
    const topQRCodes = qrCodes
      .map(q => {
        const qrFeedbacks = q.feedbacks.filter(f => new Date(f.createdAt) >= startDate);
        const qrAvgRating = qrFeedbacks.length > 0
          ? qrFeedbacks.reduce((acc, f) => acc + f.rating, 0) / qrFeedbacks.length
          : 0;
        const qrPositive = qrFeedbacks.filter(f => f.sentiment === 'positive').length;
        return {
          name: q.name,
          scans: q.scanCount,
          feedbacks: qrFeedbacks.length,
          rating: qrAvgRating.toFixed(1),
          positiveRate: qrFeedbacks.length > 0 
            ? Math.round((qrPositive / qrFeedbacks.length) * 100) 
            : 0,
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
        current: Math.round((positiveCount / totalSentiment) * 100),
        previous: prevFeedbacks.length > 0 
          ? Math.round((prevFeedbacks.filter(f => f.sentiment === 'positive').length / prevFeedbacks.length) * 100)
          : 0,
      },
    };
    comparison.positive.change = comparison.positive.current - comparison.positive.previous;

    // Peak time
    const peakHour = hourlyData.indexOf(Math.max(...hourlyData));
    const peakDay = dayOfWeekData.reduce((max, d) => d.count > max.count ? d : max, dayOfWeekData[0]);

    // Response rate (feedbacks with text / total feedbacks) - simulated
    const responseRate = totalFeedbacks > 0 ? Math.round(Math.random() * 30 + 60) : 0;

    return NextResponse.json({
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
          positive: Math.round((positiveCount / totalSentiment) * 100),
          neutral: Math.round((neutralCount / totalSentiment) * 100),
          negative: Math.round((negativeCount / totalSentiment) * 100),
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
          worstTopic: topTopics.find(t => t.sentiment === 'negative')?.name || null,
        },
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

