import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { memoryGetRuns } from '@/lib/agent-run-store';

// GET /api/admin/agents/runs

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const take = Math.min(parseInt(searchParams.get('take') || '20', 10), 100);

    const db = prisma as any;
    if (typeof db?.agentRun?.findMany !== 'function') {
      return NextResponse.json({ success: true, runs: memoryGetRuns(take), persistence: 'memory' });
    }
    const runs = await db.agentRun.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        proposals: { take: 2, orderBy: { createdAt: 'asc' } },
        decisions: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });

    return NextResponse.json({ success: true, runs, persistence: 'database' });
  } catch (error) {
    console.error('Error fetching runs:', error);
    return NextResponse.json({ error: 'Run listesi getirilemedi' }, { status: 500 });
  }
}
