import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const CACHE_SECONDS = 300;

type StatsBody = { users: number; businesses: number; feedbacks: number; rating: number };

/** Public landing page stats (users, businesses/dealers, feedbacks, average rating). */
export async function GET() {
  try {
    const { redisGetJson, redisSetJson } = await import('@/lib/redis');
    // REDIS CACHE: 3 ağır count/aggregate yerine Redis'ten oku (Redis yoksa null → DB'den hesapla).
    const cached = await redisGetJson<StatsBody>('stats:public');
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}` },
      });
    }

    const [userCount, dealerCount, feedbackAgg] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'DEALER' } }),
      prisma.feedback.aggregate({ _count: true, _avg: { rating: true } }),
    ]);

    const rating = feedbackAgg._avg.rating != null
      ? Math.round(feedbackAgg._avg.rating * 10) / 10
      : 4.9;

    const body: StatsBody = {
      users: userCount,
      businesses: dealerCount,
      feedbacks: feedbackAgg._count,
      rating: Number(rating.toFixed(1)),
    };

    await redisSetJson('stats:public', body, CACHE_SECONDS); // Redis yoksa sessizce geçer

    return NextResponse.json(body, {
      headers: {
        'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
      },
    });
  } catch (error) {
    console.error('Public stats error:', error);
    return NextResponse.json(
      { users: 0, businesses: 0, feedbacks: 0, rating: 4.9 }, { status: 200 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
