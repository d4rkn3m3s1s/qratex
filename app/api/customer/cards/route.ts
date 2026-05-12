import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/cards
 * Müşterinin kartlarını listele
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

    const cards = await prisma.physicalCard.findMany({
      where: { customerId: session.user.id },
      orderBy: { activatedAt: 'desc' },
      include: {
        _count: {
          select: { consumptions: true },
        },
        consumptions: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: {
            dealer: {
              select: {
                id: true,
                businessName: true,
              },
            },
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Toplam tüketim ve yorum bekleyen sayısı
    const stats = await prisma.consumption.aggregate({
      where: { customerId: session.user.id },
      _count: true,
    });

    const reviewPending = await prisma.consumption.count({
      where: {
        customerId: session.user.id,
        review: null,
      },
    });

    return NextResponse.json({
      success: true,
      cards,
      stats: {
        totalCards: cards.length,
        totalConsumptions: stats._count,
        reviewPending,
      },
    });
  } catch (error) {
    console.error('Error fetching cards:', error);
    return NextResponse.json(
      { error: 'Kartlar getirilemedi' },
      { status: 500 }
    );
  }
}
