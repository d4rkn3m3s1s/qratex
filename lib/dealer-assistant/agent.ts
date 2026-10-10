/**
 * b-asistan — "verine sor" ajan döngüsü (yalnız sunucu).
 *
 * Akış: sistem talimatı + görünür geçmiş + soru → model araç çağırır → araçlar YALNIZ bu bayinin
 * kapsamında sorgular (sayılar sorgudan) → sonuçlar modele döner → model atıflı yanıtı AKIŞLA
 * yazar. Her araç sonucu istemciye "dayanak" kartı olarak da gider: arayüz sayıyı LLM
 * metninden değil bu karttan gösterir.
 *
 * Hata sözleşmesi (ai-chat Bulgu 6): başarısız tur KAYDEDİLMEZ; istemci `error` olayını alır,
 * kullanıcının sorusunu "gönderilemedi" olarak korur ve yeniden denemeyi sunar. Kullanıcı
 * durdurursa o ana kadarki metin `stopped` durumuyla kaydedilir.
 */
import { isAiGuardError } from '@/lib/ai-cost-guard';
import { streamToolChatTurn, type ToolChatMessage } from '@/lib/ai-engine';
import { istanbulDay } from '@/components/ds/page/date-range';
import { deriveTitle, finalizeCitations, historyForModel, newMessageId } from './messages';
import { buildSystemPrompt } from './prompt';
import { saveTurn } from './server';
import { SourceRegistry, TOOL_DEFINITIONS, executeTool, parseToolArgs, type ToolContext } from './tools';
import type {
  AssistantErrorCode,
  AssistantFact,
  AssistantLocale,
  AssistantMessage,
  AssistantPeriod,
  AssistantSource,
  AssistantStreamEvent,
} from './types';

/** Bir sorudaki en fazla model turu (araç → yanıt). Son tur araçsız zorlanır. */
export const MAX_ROUNDS = 4;
/** Tur başına en fazla araç çağrısı. */
export const MAX_TOOLS_PER_ROUND = 4;

export interface RunTurnInput {
  dealerId: string;
  locale: AssistantLocale;
  period: AssistantPeriod;
  question: string;
  conversationId: string | null;
  /** Önceki görünür mesajlar (yeniden üretimde son kullanıcı mesajı hariç). */
  history: AssistantMessage[];
  /** Yeniden üretimde mevcut kullanıcı mesajı korunur. */
  existingUser?: AssistantMessage | null;
  regenerate: boolean;
  signal?: AbortSignal;
  emit: (event: AssistantStreamEvent) => void;
}

function errorEvent(code: AssistantErrorCode, message: string, retryable: boolean): AssistantStreamEvent {
  return { type: 'error', code, message, retryable };
}

export function guardErrorCode(err: unknown): AssistantErrorCode | null {
  if (!isAiGuardError(err)) return null;
  if (err.code === 'AI_BUDGET_EXCEEDED') return 'AI_BUDGET_EXCEEDED';
  if (err.code === 'AI_RATE_LIMIT') return 'AI_RATE_LIMIT';
  if (err.code === 'AI_DISABLED') return 'AI_DISABLED';
  return null;
}

/** Ajan turunu çalıştırır. Hiçbir zaman fırlatmaz: her sonuç bir olayla biter. */
export async function runAssistantTurn(input: RunTurnInput): Promise<void> {
  const { emit } = input;
  const today = istanbulDay();
  const sources = new SourceRegistry(24);
  const ctx: ToolContext = { dealerId: input.dealerId, defaultPeriod: input.period, locale: input.locale, today, sources };
  const facts: AssistantFact[] = [];
  const allSources: AssistantSource[] = [];

  const userMessage: AssistantMessage = input.existingUser ?? {
    id: newMessageId(),
    role: 'user',
    content: input.question,
    createdAt: new Date().toISOString(),
    period: input.period,
  };
  const assistantId = newMessageId();
  emit({ type: 'start', conversationId: input.conversationId, userMessageId: userMessage.id, assistantMessageId: assistantId, period: input.period });

  const messages: ToolChatMessage[] = [
    { role: 'system', content: buildSystemPrompt({ locale: input.locale, period: input.period, today }) },
    ...historyForModel(input.history),
    { role: 'user', content: input.question },
  ];

  let content = '';
  let modelUsed: string | null = null;
  let stopped = false;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const lastRound = round === MAX_ROUNDS - 1;
      let streamed = '';
      const res = await streamToolChatTurn({
        dealerId: input.dealerId,
        messages,
        tools: lastRound ? undefined : TOOL_DEFINITIONS,
        task: 'ask_ai',
        signal: input.signal,
        skipRateGuard: round > 0,
        onDelta: (text) => {
          streamed += text;
          emit({ type: 'delta', text });
        },
      });
      if (!res.ok) {
        if (res.reason === 'aborted') {
          stopped = true;
          content = streamed;
          break;
        }
        if (res.reason === 'unconfigured') return emit(errorEvent('AI_UNCONFIGURED', 'AI sağlayıcısı yapılandırılmamış.', false));
        if (res.reason === 'disabled') return emit(errorEvent('AI_DISABLED', 'AI özellikleri bu işletme için kapalı.', false));
        return emit(errorEvent('PROVIDER_ERROR', 'AI şu anda yanıt veremedi.', true));
      }
      modelUsed = res.modelUsed;
      if (res.toolCalls.length === 0 || lastRound) {
        content = res.content;
        break;
      }
      // Araç turu: taslak metin varsa temizlenir; araçlar sırayla çalışır.
      if (streamed) emit({ type: 'reset' });
      const calls = res.toolCalls.slice(0, MAX_TOOLS_PER_ROUND);
      messages.push({
        role: 'assistant',
        content: res.content || null,
        tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments || '{}' } })),
      });
      for (const call of calls) {
        if (input.signal?.aborted) {
          stopped = true;
          break;
        }
        emit({ type: 'tool', tool: call.name as Extract<AssistantStreamEvent, { type: 'tool' }>['tool'] });
        let forModel: Record<string, unknown>;
        try {
          const result = await executeTool(call.name, parseToolArgs(call.arguments), ctx);
          forModel = result.forModel;
          if (result.fact) {
            facts.push(result.fact);
            emit({ type: 'fact', fact: result.fact });
          }
          if (result.sources.length > 0) {
            allSources.push(...result.sources);
            emit({ type: 'sources', sources: result.sources });
          }
        } catch (err) {
          console.error('[assistant] araç hatası', call.name, err);
          forModel = { error: 'Veri şu anda okunamadı. Kullanıcıya bu veriye ulaşılamadığını söyle; sayı uydurma.' };
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(forModel) });
      }
      if (stopped) break;
    }
  } catch (err) {
    const code = guardErrorCode(err);
    if (code === 'AI_BUDGET_EXCEEDED') return emit(errorEvent(code, 'Bugünkü AI kotanız doldu.', false));
    if (code === 'AI_RATE_LIMIT') return emit(errorEvent(code, 'Çok sık soru gönderildi. Biraz sonra tekrar deneyin.', true));
    if (code === 'AI_DISABLED') return emit(errorEvent(code, 'AI özellikleri bu işletme için kapalı.', false));
    console.error('[assistant] tur başarısız', err);
    return emit(errorEvent('INTERNAL', 'Beklenmeyen bir hata oluştu.', true));
  }

  const final = finalizeCitations(content.trim(), dedupeSources(allSources));
  if (!final.content && !stopped) return emit(errorEvent('EMPTY_ANSWER', 'Yanıt üretilemedi.', true));
  if (!final.content && stopped) return; // hiçbir şey yazılmadan durduruldu: kayıt yok

  const assistantMessage: AssistantMessage = {
    id: assistantId,
    role: 'assistant',
    content: final.content,
    createdAt: new Date().toISOString(),
    status: stopped ? 'stopped' : 'complete',
    period: input.period,
    ...(facts.length > 0 ? { facts } : {}),
    ...(final.sources.length > 0 ? { sources: final.sources } : {}),
    model: modelUsed,
  };

  try {
    const saved = await saveTurn({
      dealerId: input.dealerId,
      conversationId: input.conversationId,
      title: deriveTitle(userMessage.content),
      period: input.period,
      user: userMessage,
      assistant: assistantMessage,
      regenerate: input.regenerate,
    });
    emit({ type: 'done', conversationId: saved.id, title: saved.title, userMessage, message: assistantMessage });
  } catch (err) {
    console.error('[assistant] tur kaydedilemedi', err);
    const conflict = err instanceof Error && 'code' in err && (err as { code?: unknown }).code === 'CONFLICT';
    emit(errorEvent(conflict ? 'CONFLICT' : 'INTERNAL', 'Yanıt kaydedilemedi.', true));
  }
}

function dedupeSources(list: AssistantSource[]): AssistantSource[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.ref) ? false : (seen.add(s.ref), true)));
}
