import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { AGENT_PERSONAS } from '@/lib/agent-personas';
import { generateDialogueRoundLive, councilLLMAvailable, type DialogueMessage } from '@/lib/agent-dialogue';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const topic = (searchParams.get('topic') || '').trim();
  if (topic.length < 5) {
    return new Response('Invalid topic', {
      status: 400,
      headers: { ...PRIVATE_NO_STORE_HEADERS },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const mode = councilLLMAvailable() ? 'live' : 'demo';

      const send = (event: string, payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 10000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* ignore */ }
      });

      send('meta', { topic, personas: AGENT_PERSONAS, mode });

      try {
        let messages: DialogueMessage[] = [];
        // Her tur GERÇEK LLM çağrısı yapar (4 ajan + nihai sentez).
        for (let round = 1; round <= 4 && !closed; round++) {
          const state = await generateDialogueRoundLive(topic, messages, round);
          messages = state.messages;
          const newRoundMessages = state.messages.filter((m) => m.round === round);
          send('round', { round, messages: newRoundMessages, decision: state.decision ?? null, live: state.live });

          if (state.decision) {
            send('done', state);
            break;
          }
        }
      } catch (error) {
        send('error', { message: 'Konsey üretimi sırasında hata oluştu' });
        console.error('Council stream error:', error);
      } finally {
        closed = true;
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* ignore */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0, no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

