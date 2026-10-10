import { ApiError } from '@/lib/http/define-route';
import { isAIConfigured, runChatCompletion } from '@/lib/ai-engine';
import { isAiGuardError } from '@/lib/ai-cost-guard';
import { UNTRUSTED_DATA_RULE } from '@/lib/ai-prompt-safety';

/**
 * Ekip modülünün tek AI geçidi: mevcut `runChatCompletion` (bütçe, aktör başına dakikalık
 * sınır, prompt enjeksiyon kontrolü, kullanım kaydı) üstüne yapılandırma/bütçe hatalarını
 * kullanıcıya görünür koda çevirir. GET uçları LLM çağırmaz.
 */
export async function teamChat(opts: {
  actorId: string;
  system: string;
  user: string;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  if (!isAIConfigured()) {
    throw new ApiError('AI_UNAVAILABLE', 'AI şu an yapılandırılmamış; yöneticiye bildirin.', { status: 503 });
  }
  let res: Awaited<ReturnType<typeof runChatCompletion>>;
  try {
    res = await runChatCompletion({
      system: `${opts.system}\n\n${UNTRUSTED_DATA_RULE}`,
      user: opts.user,
      jsonMode: opts.jsonMode,
      temperature: opts.temperature ?? 0.4,
      maxTokens: opts.maxTokens ?? 600,
      task: 'chat_completion',
      actorKey: `team:${opts.actorId}`,
    });
  } catch (err) {
    if (isAiGuardError(err)) {
      throw new ApiError(err.code === 'AI_RATE_LIMIT' ? 'RATE_LIMITED' : 'AI_UNAVAILABLE', err.code === 'AI_RATE_LIMIT'
        ? 'AI isteği sınırına ulaştın; bir dakika sonra tekrar dene.'
        : 'Bugünkü AI kotası doldu ya da AI kapalı.', {
        status: err.statusCode,
        retryable: err.code === 'AI_RATE_LIMIT',
      });
    }
    throw err;
  }
  if (!res) throw new ApiError('AI_UNAVAILABLE', 'AI yanıt veremedi. Biraz sonra tekrar dene.', { status: 502, retryable: true });
  return res.content.trim();
}

/** jsonMode yanıtından JSON çıkarır (bazen ``` ile sarılı gelir). */
export function extractJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* devam */
  }
  const m = trimmed.match(/[[{][\s\S]*[\]}]/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* boş */
    }
  }
  return null;
}
