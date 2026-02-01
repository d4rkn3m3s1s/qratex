import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/customer/reviews
 * Müşterinin tüm tüketim yorumlarını listele
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 403 }
      );
    }

    const reviews = await prisma.consumptionReview.findMany({
      where: {
        customerId: session.user.id,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        consumption: {
          include: {
            dealer: {
              select: {
                id: true,
                name: true,
                businessName: true,
                businessLogo: true,
              },
            },
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
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      reviews,
      count: reviews.length,
    });
  } catch (error) {
    console.error('Error fetching customer reviews:', error);
    return NextResponse.json(
      { error: 'Yorumlar getirilemedi' },
      { status: 500 }
    );
  }
}
