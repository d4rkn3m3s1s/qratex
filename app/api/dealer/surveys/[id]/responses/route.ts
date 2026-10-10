import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { listSurveyResponses } from '@/lib/dealer-surveys/service.server';
import { DEFAULT_SURVEY_RANGE, SURVEY_RANGES } from '@/lib/dealer-surveys/types';

export const dynamic = 'force-dynamic';

/** GET — tekil yanıtlar (imleçli sayfa). Kişisel kimlik dönmez; yalnız üye/anonim. */
export const GET = defineRoute(
  {
    name: 'dealer.surveys.responses',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'dealer_surveys',
    rateLimit: 'read',
    params: z.object({ id: z.string().trim().min(1).max(64) }),
    query: z.object({
      range: z.enum(SURVEY_RANGES).optional().default(DEFAULT_SURVEY_RANGE),
      cursor: z.string().max(200).optional(),
      dealerId: z.string().optional(),
    }),
  },
  async ({ tenant, params, query }) =>
    ok(await listSurveyResponses(tenant.dealerId, params.id, { range: query.range, cursor: query.cursor }), { legacySpread: true })
);
