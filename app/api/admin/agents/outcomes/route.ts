import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { memoryAttachOutcome, memoryGetRunById } from '@/lib/agent-run-store';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const outcomeSchema = z.object({
  decisionId: z.string().min(1),
  metricName: z.string().min(2).max(80),
  metricDelta: z.number(),
  successScore: z.number().min(0).max(100).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

// POST /api/admin/agents/outcomes
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const body = await req.json();
    const parsed = outcomeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const db = prisma as any;
    if (typeof db?.agentOutcome?.create !== 'function' || typeof db?.agentDecision?.findUnique !== 'function') {
      const run = memoryGetRunById(parsed.data.decisionId.split('-decision-')[0]);
      if (!run) return NextResponse.json({ error: 'Decision bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      const outcome = {
        id: `${parsed.data.decisionId}-outcome-${Date.now()}`,
        decisionId: parsed.data.decisionId,
        metricName: parsed.data.metricName,
        metricDelta: parsed.data.metricDelta,
        successScore: parsed.data.successScore ?? null,
        notes: parsed.data.notes ?? null,
        createdAt: new Date().toISOString(),
      };
      memoryAttachOutcome(parsed.data.decisionId.split('-decision-')[0], outcome);
      return NextResponse.json({ success: true, outcome, persistence: 'memory' }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const decision = await db.agentDecision.findUnique({ where: { id: parsed.data.decisionId } });
    if (!decision) return NextResponse.json({ error: 'Decision bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });

    const outcome = await db.agentOutcome.create({
      data: {
        decisionId: parsed.data.decisionId,
        metricName: parsed.data.metricName,
        metricDelta: parsed.data.metricDelta,
        successScore: parsed.data.successScore,
        notes: parsed.data.notes ?? null,
      },
    });

    return NextResponse.json({ success: true, outcome }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error creating outcome:', error);
    return NextResponse.json({ error: 'Outcome kaydı oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
