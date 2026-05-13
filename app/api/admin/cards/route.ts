import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { adminCardsQuerySchema } from '@/lib/validations-admin';


export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/cards
 * Tüm kartları listele (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const parsed = adminCardsQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      batchId: searchParams.get('batchId') ?? undefined,
    });
    const { page, pageSize, search, status, batchId } = parsed.success
      ? parsed.data
      : { page: 1, pageSize: 20, search: undefined as string | undefined, status: undefined as string | undefined, batchId: undefined as string | undefined };

    const skip = (page - 1) * pageSize;

    // Filter oluştur
    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (batchId) {
      where.batchId = batchId;
    }

    if (search) {
      where.OR = [
        { token: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [cards, total, stats] = await Promise.all([
      prisma.physicalCard.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          _count: {
            select: { consumptions: true },
          },
        },
      }),
      prisma.physicalCard.count({ where }),
      // İstatistikler
      prisma.physicalCard.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
    ]);

    // İstatistikleri düzenle
    const statusCounts = {
      UNUSED: 0,
      ACTIVATED: 0,
      BLOCKED: 0,
      total: 0,
    };
    
    stats.forEach((s) => {
      statusCounts[s.status as keyof typeof statusCounts] = s._count.status;
      statusCounts.total += s._count.status;
    });

    return NextResponse.json({
      success: true,
      items: cards,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
      stats: statusCounts,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching cards:', error);
    return NextResponse.json(
      { error: 'Kartlar getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
