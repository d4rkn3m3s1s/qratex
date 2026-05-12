import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { AGENT_PERSONAS } from '@/lib/agent-personas';
import { generateDialogueRound, type DialogueMessage } from '@/lib/agent-dialogue';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  topic: z.string().min(5).max(500),
  round: z.number().int().min(0).max(10),
  messages: z.array(
    z.object({
      id: z.string(),
      round: z.number(),
      agentName: z.string(),
      content: z.string(),
      stance: z.enum(['research', 'logic', 'creative', 'captain', 'consensus']),
    })
  ).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const payload = bodySchema.parse(await req.json());
    const nextRound = payload.round + 1;
    const priorMessages = (payload.messages ?? []) as DialogueMessage[];
    const state = generateDialogueRound(payload.topic, priorMessages, nextRound);
    return NextResponse.json({ success: true, state, personas: AGENT_PERSONAS });
  } catch (error) {
    console.error('Conversation error:', error);
    return NextResponse.json({ success: false, error: 'Ajanlar konusmasi baslatilamadi' }, { status: 400 });
  }
}

