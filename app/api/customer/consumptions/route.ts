import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  PRIVATE_NO_STORE_HEADERS,
  clampPageParam,
  clampPageSizeParam,
  paginationSkip,
  responseIfDatabaseUnavailable,
} from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

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
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = clampPageParam(searchParams.get('page'));
    const pageSize = clampPageSizeParam(searchParams.get('pageSize'), PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX);
    const hasReview = searchParams.get('hasReview'); // 'true' | 'false' | null
    const skip = paginationSkip(page, pageSize);

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

    return NextResponse.json(
      {
        success: true,
        items: consumptions,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
        },
        stats: {
          total,
          reviewPending,
          reviewed: total - reviewPending,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching consumptions:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Tüketimler getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
