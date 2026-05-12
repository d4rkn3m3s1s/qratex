
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/preagg - P2-22: Pre-aggregate daily dealer stats
 * Run via cron (Vercel Cron, GitHub Actions) or admin trigger.
 * Requires ADMIN or CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

function toDateOnly(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

async function runPreagg(request: NextRequest) {
    // Allow cron via secret (Vercel cron sends GET; external cron can use POST + Bearer)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isCron = cronSecret && (authHeader === `Bearer ${cronSecret}` || request.nextUrl.searchParams.get('cron_secret') === cronSecret);

    if (!isCron) {
      const auth = await requireAuth(['ADMIN']);
      if ('error' in auth) return auth.error;
    }

    const days = Math.min(parseInt(request.nextUrl.searchParams.get('days') || '90') || 90, 365);
    const now = new Date();
    const dealers = await prisma.user.findMany({
      where: { role: 'DEALER' },
      select: { id: true },
    });

    let upserted = 0;
    for (const dealer of dealers) {
      for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStart = toDateOnly(d);
        const dateEnd = new Date(dateStart);
        dateEnd.setDate(dateEnd.getDate() + 1);

        // QR feedbacks for this dealer on this date
        const qrFeedbacks = await prisma.feedback.findMany({
          where: {
            qrCode: { dealerId: dealer.id },
            createdAt: { gte: dateStart, lt: dateEnd },
            deletedAt: null,
          },
          select: { rating: true, sentiment: true },
        });

        let consumptionCount = 0;
        let consumptionReviews: { rating: number }[] = [];
        try {
          const consumptions = await prisma.consumption.findMany({
            where: {
              dealerId: dealer.id,
              createdAt: { gte: dateStart, lt: dateEnd },
            },
            include: { review: { select: { rating: true } } },
          });
          consumptionCount = consumptions.length;
          consumptionReviews = consumptions
            .filter((c: any) => c.review)
            .map((c: any) => ({ rating: c.review.rating }));
        } catch {
          // Consumption model may not exist
        }
        const consumptionReviewCount = consumptionReviews.length;

        const feedbackCount = qrFeedbacks.length + consumptionReviewCount;
        const scanCount = feedbackCount; // proxy: scans that led to feedback
        const allRatings = [
          ...qrFeedbacks.map((f) => f.rating),
          ...consumptionReviews.map((r) => r.rating),
        ];
        const avgRating =
          allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;
        const qrPos = qrFeedbacks.filter((f) => f.sentiment === 'positive').length;
        const qrNeu = qrFeedbacks.filter((f) => f.sentiment === 'neutral' || !f.sentiment).length;
        const qrNeg = qrFeedbacks.filter((f) => f.sentiment === 'negative').length;
        const revPos = consumptionReviews.filter((r) => r.rating >= 4).length;
        const revNeu = consumptionReviews.filter((r) => r.rating === 3).length;
        const revNeg = consumptionReviews.filter((r) => r.rating <= 2).length;
        const positiveCount = qrPos + revPos;
        const neutralCount = qrNeu + revNeu;
        const negativeCount = qrNeg + revNeg;

        await prisma.dailyDealerStats.upsert({
          where: {
            dealerId_date: { dealerId: dealer.id, date: dateStart },
          },
          create: {
            dealerId: dealer.id,
            date: dateStart,
            feedbackCount,
            avgRating,
            consumptionCount,
            consumptionReviewCount,
            scanCount,
            positiveCount,
            neutralCount,
            negativeCount,
          },
          update: {
            feedbackCount,
            avgRating,
            consumptionCount,
            consumptionReviewCount,
            scanCount,
            positiveCount,
            neutralCount,
            negativeCount,
          },
        });
        upserted++;
      }
    }

    return NextResponse.json({
      success: true,
      dealers: dealers.length,
      days,
      upserted,
    });
}

export async function GET(request: NextRequest) {
  try {
    return await runPreagg(request);
  } catch (error) {
    console.error('Preagg error:', error);
    return NextResponse.json(
      { error: 'Pre-aggregation failed', detail: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return await runPreagg(request);
  } catch (error) {
    console.error('Preagg error:', error);
    return NextResponse.json(
      { error: 'Pre-aggregation failed', detail: String(error) },
      { status: 500 }
    );
  }
}
