import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { normalizeSentimentTriplet } from '@/lib/sentiment-percentages';


export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Get customer's own feedbacks with AI analysis data
    const feedbacks = await prisma.feedback.findMany({
      where: {
        userId: session.user.id,
        text: { not: null },
      },
      select: {
        id: true,
        text: true,
        rating: true,
        sentiment: true,
        emotions: true,
        topics: true,
        intent: true,
        urgency: true,
        effortScore: true,
        churnRisk: true,
        isToxic: true,
        themes: true,
        entities: true,
        statementSentiments: true,
        actionSuggestions: true,
        aiAnalysis: true,
        createdAt: true,
        qrCode: {
          select: {
            name: true,
            dealer: {
              select: { businessName: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    if (feedbacks.length === 0) {
      return NextResponse.json(
        {
          success: true,
          totalFeedbacks: 0,
          avgRating: 0,
          sentimentDistribution: { positive: 0, negative: 0, neutral: 0 },
          topEmotions: [],
          topTopics: [],
          feedbacks: [],
          overallSentiment: 'neutral',
          avgUrgency: 0,
          avgEffort: 0,
          avgChurnRisk: 0,
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Calculate stats
    const totalFeedbacks = feedbacks.length;
    const avgRating = feedbacks.reduce((acc, f) => acc + f.rating, 0) / totalFeedbacks;

    // Sentiment distribution
    const sentimentCounts = feedbacks.reduce(
      (acc, f) => {
        const s = f.sentiment || 'neutral';
        if (s === 'positive') acc.positive++;
        else if (s === 'negative') acc.negative++;
        else acc.neutral++;
        return acc;
      },
      { positive: 0, negative: 0, neutral: 0 }
    );

    const sentimentDistribution = normalizeSentimentTriplet({
      positive: sentimentCounts.positive,
      neutral: sentimentCounts.neutral,
      negative: sentimentCounts.negative,
    });

    // Overall sentiment
    const overallSentiment = sentimentCounts.positive > sentimentCounts.negative
      ? (sentimentCounts.positive > sentimentCounts.neutral ? 'positive' : 'neutral')
      : (sentimentCounts.negative > sentimentCounts.neutral ? 'negative' : 'neutral');

    // Top emotions
    const emotionCounts: Record<string, number> = {};
    feedbacks.forEach(f => {
      const emotions = f.emotions as string[] | null;
      emotions?.forEach(e => {
        emotionCounts[e] = (emotionCounts[e] || 0) + 1;
      });
    });
    const topEmotions = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([emotion, count]) => ({ emotion, count }));

    // Top topics
    const topicCounts: Record<string, number> = {};
    feedbacks.forEach(f => {
      const topics = f.topics as string[] | null;
      topics?.forEach(t => {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      });
    });
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([topic, count]) => ({ topic, count }));

    // Average experience signals
    const urgencyValues = feedbacks.filter(f => f.urgency !== null).map(f => f.urgency!);
    const effortValues = feedbacks.filter(f => f.effortScore !== null).map(f => f.effortScore!);
    const churnValues = feedbacks.filter(f => f.churnRisk !== null).map(f => f.churnRisk!);

    const avgUrgency = urgencyValues.length > 0
      ? urgencyValues.reduce((a, b) => a + b, 0) / urgencyValues.length
      : 0;
    const avgEffort = effortValues.length > 0
      ? effortValues.reduce((a, b) => a + b, 0) / effortValues.length
      : 0;
    const avgChurnRisk = churnValues.length > 0
      ? churnValues.reduce((a, b) => a + b, 0) / churnValues.length
      : 0;

    // Format feedbacks for response
    const formattedFeedbacks = feedbacks.map(f => {
      // Parse JSON fields safely
      const themes = Array.isArray(f.themes) ? f.themes : [];
      const entities = Array.isArray(f.entities) ? f.entities : [];
      const statementSentiments = Array.isArray(f.statementSentiments) ? f.statementSentiments : [];
      const actionSuggestions = Array.isArray(f.actionSuggestions) ? f.actionSuggestions : [];
      const aiAnalysis = f.aiAnalysis as Record<string, unknown> | null;

      return {
        id: f.id,
        text: f.text!,
        rating: f.rating,
        sentiment: f.sentiment || 'neutral',
        emotions: (f.emotions as string[]) || [],
        topics: (f.topics as string[]) || [],
        intent: f.intent,
        urgency: f.urgency,
        effortScore: f.effortScore,
        churnRisk: f.churnRisk,
        isToxic: f.isToxic || false,
        themes: themes as { theme: string; subTheme?: string; sentiment: string; score: number }[],
        entities: entities as { type: string; name: string; sentiment: string }[],
        statementSentiments: statementSentiments as { statement: string; sentiment: string; score: number }[],
        actionSuggestions: actionSuggestions as { action: string; priority: string; impact: string; category: string }[],
        summary: aiAnalysis?.summary as string | null || null,
        createdAt: f.createdAt.toISOString(),
        qrCodeName: f.qrCode?.dealer?.businessName || f.qrCode?.name || 'Bilinmeyen',
      };
    });

    return NextResponse.json(
      {
        success: true,
        totalFeedbacks,
        avgRating,
        sentimentDistribution,
        topEmotions,
        topTopics,
        feedbacks: formattedFeedbacks,
        overallSentiment,
        avgUrgency,
        avgEffort,
        avgChurnRisk,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching customer AI insights:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
