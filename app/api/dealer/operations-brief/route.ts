import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
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

    // REDIS CACHE: 12 prisma cagrisi. Anahtar dealerId ile IZOLE.
    const { redisGetJson, redisSetJson } = await import('@/lib/redis');
    const cacheKey = `dealer-ops-brief:${dealerId}`;
    const cachedOps = await redisGetJson<object>(cacheKey);
    if (cachedOps) return NextResponse.json(cachedOps, { headers: PRIVATE_NO_STORE_HEADERS });

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

    // Günlük seri: önceden gün başına 2 sorgu (7×2=14) döngüde çalışıyordu →
    // date_trunc('day') ile gruplanmış 2 sorguya indirildi (feedback + consumption).
    const rangeStart = seriesDays[0].start;
    const rangeEnd = seriesDays[seriesDays.length - 1].end;
    const [fbDayRows, consDayRows] = await Promise.all([
      prisma.$queryRaw<Array<{ bucket: Date; n: bigint }>>(Prisma.sql`
        SELECT date_trunc('day', f."createdAt" AT TIME ZONE 'UTC') AS bucket, COUNT(*)::bigint AS n
        FROM "Feedback" f
        JOIN "QRCode" q ON q."id" = f."qrCodeId"
        WHERE q."dealerId" = ${dealerId}
          ${useSoftDelete ? Prisma.sql`AND f."deletedAt" IS NULL` : Prisma.empty}
          AND f."createdAt" >= ${rangeStart} AND f."createdAt" <= ${rangeEnd}
        GROUP BY 1
      `),
      prisma.$queryRaw<Array<{ bucket: Date; n: bigint }>>(Prisma.sql`
        SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS bucket, COUNT(*)::bigint AS n
        FROM "Consumption"
        WHERE "dealerId" = ${dealerId}
          AND "createdAt" >= ${rangeStart} AND "createdAt" <= ${rangeEnd}
        GROUP BY 1
      `),
    ]);
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const fbByDay = new Map(fbDayRows.map((r) => [dayKey(new Date(r.bucket)), Number(r.n)]));
    const consByDay = new Map(consDayRows.map((r) => [dayKey(new Date(r.bucket)), Number(r.n)]));
    const dailySeries = seriesDays.map((day) => ({
      date: day.key,
      feedbacks: fbByDay.get(dayKey(day.start)) ?? 0,
      consumptions: consByDay.get(dayKey(day.start)) ?? 0,
    }));

    const opsPayload = {
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
    };
    await redisSetJson(cacheKey, opsPayload, 60); // Redis yoksa sessizce gecer
    return NextResponse.json(opsPayload, { headers: PRIVATE_NO_STORE_HEADERS });
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
