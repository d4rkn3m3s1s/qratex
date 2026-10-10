/**
 * `POST /api/dealer/today/weekly/narrative` — haftalık rapor için AI anlatısı üret.
 *
 * Yalnız DEALER; `ai_features` modül kapısı; route limiti (saatte 6) + AI geçidinin kendi
 * dakikalık/günlük tavanı (`runChatCompletion` → guardAiCall). LLM yalnız deterministik
 * toplamları yorumlar; sonuç önbelleğe yazılır, GET onu okur. `regenerate: true` yoksa
 * önbellekteki anlatı döner (aynı hafta için tekrar tekrar token yakılmaz).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { isAiGuardError } from '@/lib/ai-cost-guard';
import { WeeklyRangeError, loadWeeklyReport } from '@/lib/dealer-today/weekly';
import { NarrativeUnavailableError, generateNarrative } from '@/lib/dealer-today/narrative';

export const dynamic = 'force-dynamic';

const Body = z.object({
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  regenerate: z.boolean().optional(),
});

export const POST = defineRoute(
  {
    name: 'dealer.today.weekly.narrative',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'ai_features',
    rateLimit: { max: 6, windowMs: 60 * 60_000, by: 'user' },
    schema: Body,
  },
  async ({ tenant, body }) => {
    try {
      const report = await loadWeeklyReport(tenant.dealerId, body.week);
      return ok(await generateNarrative(tenant.dealerId, report, { force: body.regenerate === true }));
    } catch (error) {
      if (error instanceof WeeklyRangeError) throw new ApiError('VALIDATION', error.message);
      if (error instanceof NarrativeUnavailableError) throw new ApiError('SERVICE_UNAVAILABLE', error.message, { retryable: false });
      if (isAiGuardError(error)) {
        const retryAfterSec = Math.max(1, Math.ceil((error.retryAfterMs ?? 60_000) / 1000));
        throw new ApiError('RATE_LIMITED', 'AI kullanım sınırına ulaşıldı. Biraz sonra tekrar deneyin.', {
          retryable: true,
          headers: { 'Retry-After': String(retryAfterSec) },
        });
      }
      throw error;
    }
  }
);
