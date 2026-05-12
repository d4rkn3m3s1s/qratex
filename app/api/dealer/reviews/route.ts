import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';


export const dynamic = 'force-dynamic';

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
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {
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

    const reviews = await prisma.consumptionReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        customer: {
          select: {
            id: true,
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
    });

    // Calculate stats
    const allReviews = await prisma.consumptionReview.findMany({
      where: {
        consumption: {
          dealerId: session.user.id,
        },
      },
      select: { rating: true },
    });

    const totalReviews = allReviews.length;
    const avgRating = totalReviews > 0
      ? allReviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews
      : 0;

    const ratingDistribution = {
      5: allReviews.filter(r => r.rating === 5).length,
      4: allReviews.filter(r => r.rating === 4).length,
      3: allReviews.filter(r => r.rating === 3).length,
      2: allReviews.filter(r => r.rating === 2).length,
      1: allReviews.filter(r => r.rating === 1).length,
    };

    return NextResponse.json({
      success: true,
      reviews,
      stats: {
        totalReviews,
        avgRating: avgRating.toFixed(1),
        ratingDistribution,
      },
    });
  } catch (error) {
    console.error('Error fetching dealer reviews:', error);
    return NextResponse.json(
      { success: false, error: 'Yorumlar getirilemedi' },
      { status: 500 }
    );
  }
}
