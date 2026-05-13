
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/preagg - P2-22: Pre-aggregate daily dealer stats
 * Run via cron (Vercel Cron, GitHub Actions) or admin trigger.
 * Requires ADMIN or CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

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
      orderBy: { id: 'asc' },
      take: 8000,
    });

    let upserted = 0;
    for (const dealer of dealers) {
      for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStart = toDateOnly(d);
        const dateEnd = new Date(dateStart);
        dateEnd.setDate(dateEnd.getDate() + 1);

        const qrFeedbackWhere = {
          qrCode: { dealerId: dealer.id },
          createdAt: { gte: dateStart, lt: dateEnd },
          deletedAt: null,
        };

        const [bySentiment, qrAgg] = await Promise.all([
          prisma.feedback.groupBy({
            by: ['sentiment'],
            where: qrFeedbackWhere,
            _count: { _all: true },
          }),
          prisma.feedback.aggregate({
            where: qrFeedbackWhere,
            _sum: { rating: true },
            _count: { _all: true },
          }),
        ]);

        let qrPos = 0;
        let qrNeu = 0;
        let qrNeg = 0;
        for (const row of bySentiment) {
          const c = row._count._all;
          if (row.sentiment === 'positive') qrPos += c;
          else if (row.sentiment === 'negative') qrNeg += c;
          else qrNeu += c;
        }

        const qrN = qrAgg._count._all;
        const qrSum = qrAgg._sum.rating ?? 0;

        let consumptionCount = 0;
        let consumptionReviewCount = 0;
        let revSum = 0;
        let revPos = 0;
        let revNeu = 0;
        let revNeg = 0;
        try {
          const [cc, revAgg, revByRating] = await Promise.all([
            prisma.consumption.count({
              where: {
                dealerId: dealer.id,
                createdAt: { gte: dateStart, lt: dateEnd },
              },
            }),
            prisma.consumptionReview.aggregate({
              where: {
                consumption: {
                  dealerId: dealer.id,
                  createdAt: { gte: dateStart, lt: dateEnd },
                },
              },
              _sum: { rating: true },
              _count: { _all: true },
            }),
            prisma.consumptionReview.groupBy({
              by: ['rating'],
              where: {
                consumption: {
                  dealerId: dealer.id,
                  createdAt: { gte: dateStart, lt: dateEnd },
                },
              },
              _count: { _all: true },
            }),
          ]);
          consumptionCount = cc;
          consumptionReviewCount = revAgg._count._all;
          revSum = revAgg._sum.rating ?? 0;
          for (const row of revByRating) {
            const c = row._count._all;
            if (row.rating >= 4) revPos += c;
            else if (row.rating === 3) revNeu += c;
            else revNeg += c;
          }
        } catch {
          // Consumption / review tabloları yoksa veya sorgu hatası
        }

        const feedbackCount = qrN + consumptionReviewCount;
        const scanCount = feedbackCount;
        const denom = qrN + consumptionReviewCount;
        const avgRating = denom > 0 ? (qrSum + revSum) / denom : 0;
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
    }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    return await runPreagg(request);
  } catch (error) {
    console.error('Preagg error:', error);
    return NextResponse.json(
      { error: 'Pre-aggregation failed', detail: String(error) }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await runPreagg(request);
  } catch (error) {
    console.error('Preagg error:', error);
    return NextResponse.json(
      { error: 'Pre-aggregation failed', detail: String(error) }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
