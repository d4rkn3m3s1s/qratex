import { z } from 'zod';
import { ApiError, defineRoute } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { detectPromptInjectionTr } from '@/lib/ai-prompt-safety';
import { getServerLocale } from '@/lib/server-locale';
import { runAssistantTurn } from '@/lib/dealer-assistant/agent';
import { getConversationMessages, loadAssistantStatus, loadQuota } from '@/lib/dealer-assistant/server';
import { splitForRegenerate } from '@/lib/dealer-assistant/messages';
import { NDJSON_CONTENT_TYPE, encodeEvent } from '@/lib/dealer-assistant/stream';
import { ASSISTANT_PERIODS, DEFAULT_ASSISTANT_PERIOD, QUESTION_MAX, type AssistantMessage } from '@/lib/dealer-assistant/types';

export const dynamic = 'force-dynamic';
/** Araç turları + akış: en kötü durumda 4 model turu × ~12 sn. */
export const maxDuration = 60;

const Body = z
  .object({
    conversationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable().optional(),
    question: z.string().trim().max(QUESTION_MAX).optional(),
    period: z.enum(ASSISTANT_PERIODS).optional(),
    locale: z.enum(['tr', 'en']).optional(),
    regenerate: z.boolean().optional(),
  })
  .strict()
  .refine((b) => (b.regenerate ? !!b.conversationId : (b.question?.length ?? 0) >= 2), {
    message: 'Soru en az 2 karakter olmalı.',
    path: ['question'],
  });

/**
 * POST /api/dealer/assistant/chat — "verine sor" turu, NDJSON akışı.
 *
 * Akış açılmadan ÖNCE (doğru HTTP durumu ile) denetlenir: rol + kiracı + modül + dakikalık
 * limit (`defineRoute`), AI sağlayıcısı / bayi AI anahtarı, günlük kota, sorudaki injection,
 * sohbet sahipliği. Akış içindeki hatalar `error` olayıyla biter ve tur kaydedilmez.
 */
export const POST = defineRoute(
  {
    name: 'dealer.assistant.chat',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'ai_features',
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
    schema: Body,
    maxBodyBytes: 16_000,
  },
  async ({ tenant, body, request }) => {
    const dealerId = tenant.dealerId;
    const status = await loadAssistantStatus(dealerId);
    if (status === 'unconfigured') throw new ApiError('AI_UNCONFIGURED', 'AI sağlayıcısı yapılandırılmamış.', { status: 503 });
    if (status === 'ai_disabled') throw new ApiError('AI_DISABLED', 'AI özellikleri bu işletme için kapalı. AI ayarlarından açabilirsiniz.', { status: 403 });

    const quota = await loadQuota(dealerId);
    if (quota.exhausted) {
      const retryAfter = Math.max(60, Math.ceil((Date.parse(quota.resetsAt) - Date.now()) / 1000));
      throw new ApiError('AI_BUDGET_EXCEEDED', 'Bugünkü AI kotanız doldu.', { status: 429, headers: { 'Retry-After': String(retryAfter) } });
    }

    const conversationId = body.conversationId ?? null;
    let history: AssistantMessage[] = [];
    let existingUser: AssistantMessage | null = null;
    let question = body.question ?? '';
    let period = body.period ?? DEFAULT_ASSISTANT_PERIOD;

    if (conversationId) {
      const conv = await getConversationMessages(dealerId, conversationId);
      if (!conv) throw new ApiError('NOT_FOUND', 'Sohbet bulunamadı.');
      if (!body.period) period = conv.period;
      if (body.regenerate) {
        const split = splitForRegenerate(conv.messages);
        if (!split) throw new ApiError('NOTHING_TO_REGENERATE', 'Yeniden üretilecek soru yok.', { status: 409 });
        history = split.history;
        existingUser = split.user;
        question = split.user.content;
        if (!body.period && split.user.period) period = split.user.period;
      } else {
        history = conv.messages;
      }
    }

    if (detectPromptInjectionTr(question)) {
      throw new ApiError('INPUT_REJECTED', 'Bu soru güvenlik nedeniyle işlenemedi. Lütfen farklı ifade edin.', { status: 422 });
    }

    const locale = body.locale ?? ((await getServerLocale().catch(() => 'tr')) === 'en' ? 'en' : 'tr');
    const controller = new AbortController();
    request.signal?.addEventListener('abort', () => controller.abort(), { once: true });
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(sink) {
        let closed = false;
        const emit = (event: Parameters<typeof encodeEvent>[0]) => {
          if (closed) return;
          try {
            sink.enqueue(encoder.encode(encodeEvent(event)));
          } catch {
            closed = true;
          }
        };
        try {
          await runAssistantTurn({
            dealerId,
            locale,
            period,
            question,
            conversationId,
            history,
            existingUser,
            regenerate: body.regenerate === true,
            signal: controller.signal,
            emit,
          });
        } finally {
          if (!closed) {
            closed = true;
            try {
              sink.close();
            } catch {
              /* istemci gitti */
            }
          }
        }
      },
      cancel() {
        controller.abort();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { ...PRIVATE_NO_STORE_HEADERS, 'content-type': NDJSON_CONTENT_TYPE, 'x-accel-buffering': 'no' },
    });
  },
);
