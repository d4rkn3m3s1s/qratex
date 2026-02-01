import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/customer/consumptions
 * Müşterinin tüketim geçmişi
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const hasReview = searchParams.get('hasReview'); // 'true' | 'false' | null
    const skip = (page - 1) * pageSize;

    // Filter
    const where: any = { customerId: session.user.id };
    
    if (hasReview === 'true') {
      where.review = { isNot: null };
    } else if (hasReview === 'false') {
      where.review = null;
    }

    const [consumptions, total, reviewPending] = await Promise.all([
      prisma.consumption.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          dealer: {
            select: {
              id: true,
              name: true,
              businessName: true,
              businessLogo: true,
              image: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              category: {
                select: {
                  id: true,
                  name: true,
                  icon: true,
                },
              },
            },
          },
          review: {
            select: {
              id: true,
              rating: true,
              text: true,
              dimensions: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.consumption.count({ where }),
      // Yorum bekleyen tüketim sayısı
      prisma.consumption.count({
        where: {
          customerId: session.user.id,
          review: null,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      items: consumptions,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
      stats: {
        total,
        reviewPending,
        reviewed: total - reviewPending,
      },
    });
  } catch (error) {
    console.error('Error fetching consumptions:', error);
    return NextResponse.json(
      { error: 'Tüketimler getirilemedi' },
      { status: 500 }
    );
  }
}
