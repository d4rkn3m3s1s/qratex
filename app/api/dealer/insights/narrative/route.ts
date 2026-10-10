/**
 * `POST /api/dealer/insights/narrative` — dönem için AI anlatısı üret (ya da saklıyı döndür).
 *
 * Yalnız DEALER; `ai_features` modül kapısı; route limiti (saatte 6) + AI geçidinin kendi
 * dakikalık/günlük tavanı (`runChatCompletion` → guardAiCall) + 10 dk soğuma (veri değişmediyse).
 * LLM yalnız deterministik olguları anlatır; her cümle bir kaynağa bağlı, olgularda olmayan
 * sayı içeren cümle atılır. Sonuç `AIInsightReport`'a yazılır; GET onu okur.
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { isAiGuardError } from '@/lib/ai-cost-guard';
import { insightsPeriodBodySchema, objectParams, parseInsightsSearch } from '@/lib/dealer-insights/params';
import { loadAggregates } from '@/lib/dealer-insights/server';
import { NarrativeCooldownError, NarrativeUnavailableError, generateNarrative } from '@/lib/dealer-insights/narrative';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.insights.narrative',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'ai_features',
    rateLimit: { max: 6, windowMs: 60 * 60_000, by: 'user' },
    schema: insightsPeriodBodySchema,
  },
  async ({ tenant, body }) => {
    const query = parseInsightsSearch(objectParams(body as Record<string, unknown>));
    const locale = body.lang === 'en' ? 'en' : 'tr';
    try {
      // Anlatı her zaman TAZE toplamlardan üretilir (önbellekteki eski sayı anlatılmasın).
      const agg = await loadAggregates(tenant.dealerId, query, { fresh: true });
      return ok(
        await generateNarrative({ dealerId: tenant.dealerId, query, agg, locale, regenerate: body.regenerate === true })
      );
    } catch (error) {
      if (error instanceof NarrativeCooldownError) {
        const sec = Math.max(1, Math.ceil(error.retryAfterMs / 1000));
        throw new ApiError('RATE_LIMITED', error.message, { retryable: true, headers: { 'Retry-After': String(sec) } });
      }
      if (error instanceof NarrativeUnavailableError) {
        if (error.reason === 'insufficient') throw new ApiError('VALIDATION', error.message);
        throw new ApiError('SERVICE_UNAVAILABLE', error.message, { retryable: error.reason === 'invalid_output' });
      }
      if (isAiGuardError(error)) {
        const sec = Math.max(1, Math.ceil((error.retryAfterMs ?? 60_000) / 1000));
        throw new ApiError('RATE_LIMITED', 'AI kullanım sınırına ulaşıldı. Biraz sonra tekrar deneyin.', {
          retryable: true,
          headers: { 'Retry-After': String(sec) },
        });
      }
      throw error;
    }
  }
);
