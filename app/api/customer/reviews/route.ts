import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

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
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const customerId = session.user.id;
    const LIST_CAP = 200;

    const [reviews, totalCount] = await Promise.all([
      prisma.consumptionReview.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: LIST_CAP,
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
      }),
      prisma.consumptionReview.count({ where: { customerId } }),
    ]);

    return NextResponse.json(
      {
        success: true,
        reviews,
        count: totalCount,
        truncated: totalCount > LIST_CAP,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching customer reviews:', error);
    return NextResponse.json(
      { error: 'Yorumlar getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
