import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { memoryGetRunById } from '@/lib/agent-run-store';


export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const { id } = await context.params;
    const db = prisma as any;
    if (typeof db?.agentRun?.findUnique !== 'function') {
      const memoryRun = memoryGetRunById(id);
      if (!memoryRun) return NextResponse.json({ error: 'Run bulunamadı' }, { status: 404 });
      return NextResponse.json({ success: true, run: memoryRun, persistence: 'memory' });
    }
    const run = await db.agentRun.findUnique({
      where: { id },
      include: {
        messages: { orderBy: [{ round: 'asc' }, { createdAt: 'asc' }] },
        proposals: { orderBy: { createdAt: 'asc' } },
        decisions: { include: { outcomes: true }, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!run) return NextResponse.json({ error: 'Run bulunamadı' }, { status: 404 });
    return NextResponse.json({ success: true, run, persistence: 'database' });
  } catch (error) {
    console.error('Error fetching run detail:', error);
    return NextResponse.json({ error: 'Run detayı getirilemedi' }, { status: 500 });
  }
}
