import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { AGENT_PERSONAS } from '@/lib/agent-personas';
import { generateDialogueRound } from '@/lib/agent-dialogue';


export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const topic = (searchParams.get('topic') || '').trim();
  if (topic.length < 5) {
    return new Response('Invalid topic', { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let round = 0;
      let messages: any[] = [];

      const send = (event: string, payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send('meta', { topic, personas: AGENT_PERSONAS });

      const tick = () => {
        if (closed) return;
        round += 1;
        const state = generateDialogueRound(topic, messages, round);
        messages = state.messages;
        const newRoundMessages = state.messages.filter((m) => m.round === round);
        send('round', { round, messages: newRoundMessages, decision: state.decision ?? null });

        if (state.decision || round >= 6) {
          send('done', state);
          closed = true;
          controller.close();
          return;
        }
        setTimeout(tick, 1650);
      };

      const timer = setTimeout(tick, 500);
      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 10000);

      // safety cleanup in case client disconnects
      req.signal.addEventListener('abort', () => {
        closed = true;
        clearTimeout(timer);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

