import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { buildUtcCalendarDayBuckets } from '@/lib/utc-calendar-day-buckets';

export const dynamic = 'force-dynamic';

const MS_7D = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    const dealerId = auth.session.user.id;

    const now = new Date();
    const since7d = new Date(now.getTime() - MS_7D);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    let useSoftDelete = true;
    try {
      await prisma.feedback.count({ where: { qrCode: { dealerId }, deletedAt: null } });
    } catch {
      useSoftDelete = false;
    }

    const fbBase = useSoftDelete
      ? ({ qrCode: { dealerId }, deletedAt: null } as const)
      : ({ qrCode: { dealerId } } as const);

    const seriesDays = buildUtcCalendarDayBuckets(now, 7);

    const [
      feedbackUnread,
      feedbacks7d,
      consumptionsToday,
      consumptions7d,
      actionOpen,
      actionCompleted7d,
      activeProducts,
      remedyPending,
      qrActive,
    ] = await Promise.all([
      prisma.feedback.count({
        where: {
          ...fbBase,
          dealerFirstViewedAt: null,
        },
      }),
      prisma.feedback.count({
        where: {
          ...fbBase,
          createdAt: { gte: since7d },
        },
      }),
      prisma.consumption.count({
        where: { dealerId, createdAt: { gte: startOfToday } },
      }),
      prisma.consumption.count({
        where: { dealerId, createdAt: { gte: since7d } },
      }),
      prisma.actionItem.count({
        where: {
          dealerId,
          status: { in: ['pending', 'assigned', 'in_progress'] },
        },
      }),
      prisma.actionItem.count({
        where: {
          dealerId,
          status: 'done',
          completedAt: { gte: since7d },
        },
      }),
      prisma.product.count({ where: { dealerId, isActive: true } }),
      prisma.remedyOffer.count({ where: { dealerId, status: 'pending' } }),
      prisma.qRCode.count({ where: { dealerId, isActive: true } }),
    ]);

    const dailySeries = await Promise.all(
      seriesDays.map(async (day) => {
        const [feedbacks, consumptions] = await Promise.all([
          prisma.feedback.count({
            where: {
              ...fbBase,
              createdAt: { gte: day.start, lte: day.end },
            },
          }),
          prisma.consumption.count({
            where: { dealerId, createdAt: { gte: day.start, lte: day.end } },
          }),
        ]);
        return { date: day.key, feedbacks, consumptions };
      })
    );

    return NextResponse.json(
      {
        success: true,
        generatedAt: now.toISOString(),
        since7d: since7d.toISOString(),
        startOfToday: startOfToday.toISOString(),
        feedback: {
          unread: feedbackUnread,
          last7d: feedbacks7d,
        },
        consumptions: {
          today: consumptionsToday,
          last7d: consumptions7d,
        },
        actionItems: {
          open: actionOpen,
          completedLast7d: actionCompleted7d,
        },
        catalog: {
          activeProducts,
          activeQrCodes: qrActive,
        },
        remedy: {
          pendingCustomerOffers: remedyPending,
        },
        dailySeries,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('operations-brief:', error);
    return NextResponse.json(
      { success: false, error: 'Operasyon özeti alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
