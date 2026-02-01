import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/cards
 * Tüm kartları listele (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const status = searchParams.get('status'); // UNUSED, ACTIVATED, BLOCKED
    const batchId = searchParams.get('batchId');
    const search = searchParams.get('search');
    
    const skip = (page - 1) * pageSize;

    // Filter oluştur
    const where: any = {};
    
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
    });
  } catch (error) {
    console.error('Error fetching cards:', error);
    return NextResponse.json(
      { error: 'Kartlar getirilemedi' },
      { status: 500 }
    );
  }
}
