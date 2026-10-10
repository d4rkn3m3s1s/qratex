import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getSurveyResults } from '@/lib/dealer-surveys/service.server';
import { DEFAULT_SURVEY_RANGE, SURVEY_RANGES } from '@/lib/dealer-surveys/types';

export const dynamic = 'force-dynamic';

/**
 * GET — sonuç özeti: dönem filtresi, günlük eğilim (İstanbul), soru başına SQL toplama
 * (yalnız tanımlı seçenek / 1–5 puan / dolu metin sayılır), yanıtlayan/atlayan.
 * ADMIN destek için `?dealerId=` ile salt-okunur görebilir (eskiden her zaman 404'tü).
 */
export const GET = defineRoute(
  {
    name: 'dealer.surveys.results',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'dealer_surveys',
    rateLimit: 'read',
    params: z.object({ id: z.string().trim().min(1).max(64) }),
    query: z.object({ range: z.enum(SURVEY_RANGES).optional().default(DEFAULT_SURVEY_RANGE), dealerId: z.string().optional() }),
  },
  async ({ tenant, params, query }) => ok(await getSurveyResults(tenant.dealerId, params.id, query.range), { legacySpread: true })
);
