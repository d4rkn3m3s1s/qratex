import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(request.url);
    const take = Math.min(100, Number(searchParams.get('take') || 20));

    const items = await prisma.userAutomationRun.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        rule: { select: { id: true, name: true } },
        triggeredBy: { select: { id: true, name: true, email: true } },
      },
    });

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [stats, failCount, totalCount, avgAffected] = await Promise.all([
      prisma.userAutomationRun.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { createdAt: { gte: last24h } },
      }),
      prisma.userAutomationRun.count({ where: { createdAt: { gte: last24h }, status: 'failed' } }),
      prisma.userAutomationRun.count({ where: { createdAt: { gte: last24h } } }),
      prisma.userAutomationRun.aggregate({
        where: { createdAt: { gte: last24h }, status: 'completed' },
        _avg: { affectedCount: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      items,
      metrics: {
        last24hTotalRuns: totalCount,
        last24hFailedRuns: failCount,
        last24hFailureRate: totalCount > 0 ? Number(((failCount / totalCount) * 100).toFixed(2)) : 0,
        avgAffectedUsersCompleted: Number((avgAffected._avg.affectedCount || 0).toFixed(2)),
        byStatus: stats.reduce<Record<string, number>>((acc, row) => {
          acc[row.status] = row._count._all;
          return acc;
        }, {}),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Run geçmişi alınamadı' }, { status: 500 });
  }
}
