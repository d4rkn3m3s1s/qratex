import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadAssistantOverview } from '@/lib/dealer-assistant/server';
import { ASSISTANT_PERIODS, DEFAULT_ASSISTANT_PERIOD } from '@/lib/dealer-assistant/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/assistant — açılış özeti: AI durumu, günlük kota, veriden türeyen öneriler.
 * LLM çağırmaz (yol haritası §4.4: GET'te LLM yok). Modül kapısı `ai_features`.
 */
export const GET = defineRoute(
  {
    name: 'dealer.assistant.overview',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'ai_features',
    rateLimit: 'read',
    query: z.object({ period: z.enum(ASSISTANT_PERIODS).optional().catch(undefined) }),
  },
  async ({ tenant, query }) => ok(await loadAssistantOverview(tenant.dealerId, query.period ?? DEFAULT_ASSISTANT_PERIOD)),
);
