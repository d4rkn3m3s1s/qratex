import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { computeCouncil } from '@/lib/agent-council';
import { AGENT_PERSONAS } from '@/lib/agent-personas';
import { memoryAddRun } from '@/lib/agent-run-store';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const runSchema = z.object({
  goal: z.string().min(5).max(500),
  context: z.record(z.any()).optional(),
});

// POST /api/admin/agents/run
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await req.json();
    const parsed = runSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { goal, context } = parsed.data;
    const council = await computeCouncil(goal);
    const db = prisma as any;
    const supportsPersistentRun = typeof db?.agentRun?.create === 'function';
    const baseId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const createdAt = new Date();

    const fallbackRun = {
      id: baseId,
      goal,
      status: 'completed',
      createdById: session.user.id,
      context: { ...(context ?? {}), metrics: council.metrics },
      finalDecision: council.rationale,
      winnerAgent: council.winner,
      confidence: Number((council.consensusScore / 100).toFixed(2)),
      createdAt,
      updatedAt: createdAt,
      messages: [
        ...council.proposals.map((p, idx) => ({
          id: `${baseId}-m-p-${idx + 1}`,
          agentName: p.agentName,
          role: 'proposal',
          content: `${AGENT_PERSONAS[p.agentName].codename}: ${p.details}`,
          round: 1,
          score: p.confidence,
        })),
        ...council.critiques.map((c, idx) => ({
          id: `${baseId}-m-c-${idx + 1}`,
          agentName: c.agentName,
          role: 'critique',
          content: c.content,
          round: 2,
          score: c.score,
        })),
        {
          id: `${baseId}-m-consensus`,
          agentName: 'Grok',
          role: 'consensus',
          content: council.rationale,
          round: 3,
          score: council.consensusScore,
        },
      ],
      proposals: council.proposals.map((p, idx) => ({
        id: `${baseId}-proposal-${idx + 1}`,
        ...p,
      })),
      decisions: [
        {
          id: `${baseId}-decision-1`,
          winnerAgent: council.winner,
          rationale: council.rationale,
          suggestedActions: council.actions,
          consensusScore: council.consensusScore,
          outcomes: [],
          createdAt,
        },
      ],
      personas: AGENT_PERSONAS,
      persistence: supportsPersistentRun ? 'database' : 'memory',
    };

    if (!supportsPersistentRun) {
      memoryAddRun(fallbackRun);
      return NextResponse.json({ success: true, run: fallbackRun, warning: 'AgentRun tablolari bulunamadi, memory fallback kullanildi.' }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const run = await db.agentRun.create({
      data: {
        goal,
        status: 'completed',
        createdById: session.user.id,
        context: fallbackRun.context,
        finalDecision: council.rationale,
        winnerAgent: council.winner,
        confidence: Number((council.consensusScore / 100).toFixed(2)),
        messages: {
          create: fallbackRun.messages.map((m) => ({
            agentName: m.agentName,
            role: m.role,
            content: m.content,
            round: m.round,
            score: m.score,
          })),
        },
        proposals: {
          create: council.proposals.map((p) => ({
            agentName: p.agentName,
            proposalType: p.proposalType,
            title: p.title,
            details: p.details,
            expectedImpact: p.expectedImpact,
            confidence: p.confidence,
            priority: p.priority,
          })),
        },
        decisions: {
          create: {
            winnerAgent: council.winner,
            rationale: council.rationale,
            suggestedActions: council.actions,
            consensusScore: council.consensusScore,
          },
        },
      },
      include: {
        messages: true,
        proposals: true,
        decisions: { include: { outcomes: true } },
      },
    });

    return NextResponse.json({ success: true, run: { ...run, personas: AGENT_PERSONAS, persistence: 'database' } }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error creating agent run:', error);
    return NextResponse.json({ error: 'Ajan koşusu oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
