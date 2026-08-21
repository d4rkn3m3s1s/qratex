import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { buildUtcCalendarDayBuckets } from '@/lib/utc-calendar-day-buckets';

export const dynamic = 'force-dynamic';

const MS_24H = 24 * 60 * 60 * 1000;
const MS_7D = 7 * MS_24H;

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    // REDIS CACHE: 12 prisma cagrisi. Platform geneli (kisiye ozel degil) → global anahtar.
    const { redisGetJson, redisSetJson } = await import('@/lib/redis');
    const cacheKey = 'admin:platform-pulse';
    const cachedPulse = await redisGetJson<object>(cacheKey);
    if (cachedPulse) return NextResponse.json(cachedPulse, { headers: PRIVATE_NO_STORE_HEADERS });

    const now = new Date();
    const since24h = new Date(now.getTime() - MS_24H);
    const since7d = new Date(now.getTime() - MS_7D);

    const fbWhere24: Prisma.FeedbackWhereInput = {
      deletedAt: null,
      createdAt: { gte: since24h },
    };
    const fbWhere7: Prisma.FeedbackWhereInput = {
      deletedAt: null,
      createdAt: { gte: since7d },
    };

    const seriesDays = buildUtcCalendarDayBuckets(now, 7);

    const [
      auditLogs24h,
      feedbacks24h,
      feedbacks7d,
      consumptions24h,
      consumptions7d,
      newUsers24h,
      newUsers7d,
      recentAudits,
      auditsByEntity,
      ...dailyChunks
    ] = await Promise.all([
      prisma.auditLog.count({ where: { createdAt: { gte: since24h } } }),
      prisma.feedback.count({ where: fbWhere24 }),
      prisma.feedback.count({ where: fbWhere7 }),
      prisma.consumption.count({ where: { createdAt: { gte: since24h } } }),
      prisma.consumption.count({ where: { createdAt: { gte: since7d } } }),
      prisma.user.count({ where: { createdAt: { gte: since24h } } }),
      prisma.user.count({ where: { createdAt: { gte: since7d } } }),
      prisma.auditLog.findMany({
        where: { createdAt: { gte: since24h } },
        orderBy: { createdAt: 'desc' },
        take: 18,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          createdAt: true,
          user: { select: { email: true, name: true, role: true } },
        },
      }),
      prisma.auditLog.groupBy({
        by: ['entity'],
        where: { createdAt: { gte: since24h } },
        _count: { _all: true },
        orderBy: { _count: { entity: 'desc' } },
        take: 10,
      }),
      ...seriesDays.map((day) =>
        Promise.all([
          prisma.feedback.count({
            where: { deletedAt: null, createdAt: { gte: day.start, lte: day.end } },
          }),
          prisma.consumption.count({
            where: { createdAt: { gte: day.start, lte: day.end } },
          }),
          prisma.auditLog.count({
            where: { createdAt: { gte: day.start, lte: day.end } },
          }),
        ]).then(([feedbacks, consumptions, audits]) => ({ date: day.key, feedbacks, consumptions, audits }))
      ),
    ]);

    const dailySeries = dailyChunks as {
      date: string;
      feedbacks: number;
      consumptions: number;
      audits: number;
    }[];

    const pulsePayload = {
        success: true,
        generatedAt: now.toISOString(),
        window24hSince: since24h.toISOString(),
        window7dSince: since7d.toISOString(),
        counts24h: {
          auditLogs: auditLogs24h,
          feedbacks: feedbacks24h,
          consumptions: consumptions24h,
          newUsers: newUsers24h,
        },
        counts7d: {
          feedbacks: feedbacks7d,
          consumptions: consumptions7d,
          newUsers: newUsers7d,
        },
        recentAudits,
        auditsByEntity: auditsByEntity.map((r) => ({ entity: r.entity, count: r._count._all })),
        dailySeries,
    };
    await redisSetJson(cacheKey, pulsePayload, 60); // Redis yoksa sessizce gecer
    return NextResponse.json(pulsePayload, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('platform-pulse:', error);
    return NextResponse.json(
      { success: false, error: 'Platform nabzı alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
