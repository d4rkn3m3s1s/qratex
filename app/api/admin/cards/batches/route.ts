import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/cards/batches
 * Tüm batch'leri listele
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

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
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching batches:', error);
    return NextResponse.json(
      { error: 'Batch listesi alınamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
