import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/cards/batches
 * Tüm batch'leri listele
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

    const batches = await prisma.cardBatch.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Her batch için kart istatistikleri
    const batchesWithStats = await Promise.all(
      batches.map(async (batch) => {
        const stats = await prisma.physicalCard.groupBy({
          by: ['status'],
          where: { batchId: batch.id },
          _count: { status: true },
        });

        const statusCounts = {
          UNUSED: 0,
          ACTIVATED: 0,
          BLOCKED: 0,
        };

        stats.forEach((s) => {
          statusCounts[s.status as keyof typeof statusCounts] = s._count.status;
        });

        return {
          ...batch,
          stats: statusCounts,
        };
      })
    );

    return NextResponse.json({
      success: true,
      batches: batchesWithStats,
    });
  } catch (error) {
    console.error('Error fetching batches:', error);
    return NextResponse.json(
      { error: 'Batch listesi alınamadı' },
      { status: 500 }
    );
  }
}
