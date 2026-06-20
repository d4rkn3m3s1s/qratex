import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, clampTakeParam, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const REVIEW_LIST_MAX = 100;
const REVIEW_LIST_DEFAULT = 50;

/**
 * GET /api/dealer/reviews
 * Bayinin aldığı tüm tüketim yorumlarını listele
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const ratingFilter = searchParams.get('rating');
    const limit = clampTakeParam(searchParams.get('limit'), REVIEW_LIST_DEFAULT, REVIEW_LIST_MAX);

    const where: {
      consumption: { dealerId: string };
      rating?: number;
    } = {
      consumption: {
        dealerId: session.user.id,
      },
    };

    if (ratingFilter && ratingFilter !== 'all') {
      const n = parseInt(ratingFilter, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= 5) {
        where.rating = n;
      }
    }

    const statsWhere = {
      consumption: { dealerId: session.user.id },
    };

    const [reviews, groupedRatings, avgRow] = await Promise.all([
      prisma.consumptionReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          customer: {
            // Ham müşteri ID'si bayiye sızdırılmaz (gizlilik).
            select: {
              name: true,
              email: true,
              image: true,
            },
          },
          consumption: {
            select: {
              id: true,
              amount: true,
              createdAt: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  category: {
                    select: {
                      name: true,
                      icon: true,
                    },
                  },
                },
              },
              card: {
                select: {
                  id: true,
                  token: true,
                },
              },
            },
          },
        },
      }),
      prisma.consumptionReview.groupBy({
        by: ['rating'],
        where: statsWhere,
        _count: { _all: true },
      }),
      prisma.consumptionReview.aggregate({
        where: statsWhere,
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    const totalReviews = avgRow._count;
    const avgNum = avgRow._avg.rating ?? 0;
    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const row of groupedRatings) {
      const r = row.rating;
      if (r >= 1 && r <= 5) {
        ratingDistribution[r as keyof typeof ratingDistribution] = row._count._all;
      }
    }

    const reviewsPublic = reviews.map((r) => {
      const token = r.consumption.card?.token;
      const tokenPublic =
        typeof token === 'string' && token.length > 0 ? token.slice(-4) : '';
      return {
        ...r,
        consumption: {
          ...r.consumption,
          card: r.consumption.card
            ? { id: r.consumption.card.id, token: tokenPublic }
            : r.consumption.card,
        },
      };
    });

    return NextResponse.json(
      {
        success: true,
        reviews: reviewsPublic,
        stats: {
          totalReviews,
          avgRating: totalReviews > 0 ? avgNum.toFixed(1) : '0.0',
          ratingDistribution,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching dealer reviews:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Yorumlar getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
