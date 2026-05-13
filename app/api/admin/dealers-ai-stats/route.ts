import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    // Get all dealers with their feedback stats
    const dealers = await prisma.user.findMany({
      where: { role: 'DEALER' },
      select: {
        id: true,
        name: true,
        businessName: true,
        qrCodes: {
          select: {
            feedbacks: {
              select: {
                id: true,
                text: true,
                rating: true,
                sentiment: true,
                intent: true,
                urgency: true,
                churnRisk: true,
                isToxic: true,
                aiProcessedAt: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    let totalAnalyzed = 0;
    let urgentCount = 0;
    let toxicCount = 0;
    let churnCount = 0;
    const intentDist: Record<string, number> = { complaint: 0, suggestion: 0, praise: 0, question: 0, general: 0 };
    const recentAnalyses: {
      feedbackId: string;
      text: string;
      sentiment: string;
      intent: string;
      urgency: number;
      dealerName: string;
      createdAt: string;
    }[] = [];

    const dealerStats = dealers.map(dealer => {
      const allFeedbacks = dealer.qrCodes.flatMap(qr => qr.feedbacks);
      const feedbackCount = allFeedbacks.length;
      const avgRating = feedbackCount > 0
        ? allFeedbacks.reduce((acc, f) => acc + f.rating, 0) / feedbackCount
        : 0;

      // Count sentiments
      const sentiments = allFeedbacks.reduce(
        (acc, f) => {
          if (f.sentiment === 'positive') acc.positive++;
          else if (f.sentiment === 'negative') acc.negative++;
          else acc.neutral++;
          return acc;
        },
        { positive: 0, negative: 0, neutral: 0 }
      );

      const dominantSentiment = sentiments.positive >= sentiments.negative
        ? (sentiments.positive > sentiments.neutral ? 'positive' : 'neutral')
        : (sentiments.negative > sentiments.neutral ? 'negative' : 'neutral');

      // Count analyzed
      const analyzed = allFeedbacks.filter(f => f.aiProcessedAt).length;
      totalAnalyzed += analyzed;

      // Count urgent, toxic, churn
      allFeedbacks.forEach(f => {
        if (f.urgency && f.urgency > 0.7) urgentCount++;
        if (f.isToxic) toxicCount++;
        if (f.churnRisk && f.churnRisk > 0.7) churnCount++;
        if (f.intent) {
          const intent = f.intent as string;
          if (intent in intentDist) intentDist[intent]++;
          else intentDist.general++;
        }

        // Collect recent analyses
        if (f.aiProcessedAt && f.text) {
          recentAnalyses.push({
            feedbackId: f.id,
            text: f.text,
            sentiment: f.sentiment || 'neutral',
            intent: f.intent || 'general',
            urgency: f.urgency || 0,
            dealerName: dealer.businessName || dealer.name || 'İsimsiz',
            createdAt: f.createdAt.toISOString(),
          });
        }
      });

      return {
        id: dealer.id,
        name: dealer.businessName || dealer.name || 'İsimsiz',
        feedbackCount,
        avgRating,
        sentiment: dominantSentiment,
      };
    });

    // Sort dealers by feedback count desc
    dealerStats.sort((a, b) => b.feedbackCount - a.feedbackCount);

    // Sort recent analyses by date desc
    recentAnalyses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      dealers: dealerStats.slice(0, 20),
      analyzedCount: totalAnalyzed,
      urgentCount,
      toxicCount,
      churnCount,
      intentDist,
      recentAnalyses: recentAnalyses.slice(0, 20),
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching admin AI stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
