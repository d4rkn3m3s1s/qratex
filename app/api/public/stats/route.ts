import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const CACHE_SECONDS = 300;

/** Public landing page stats (users, businesses/dealers, feedbacks, average rating). */
export async function GET() {
  try {
    const [userCount, dealerCount, feedbackAgg] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'DEALER' } }),
      prisma.feedback.aggregate({ _count: true, _avg: { rating: true } }),
    ]);

    const rating = feedbackAgg._avg.rating != null
      ? Math.round(feedbackAgg._avg.rating * 10) / 10
      : 4.9;

    const body = {
      users: userCount,
      businesses: dealerCount,
      feedbacks: feedbackAgg._count,
      rating: Number(rating.toFixed(1)),
    };

    return NextResponse.json(body, {
      headers: {
        'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
      },
    });
  } catch (error) {
    console.error('Public stats error:', error);
    return NextResponse.json(
      { users: 0, businesses: 0, feedbacks: 0, rating: 4.9 },
      { status: 200 }
    );
  }
}
