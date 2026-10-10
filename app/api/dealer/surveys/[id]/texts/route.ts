import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { listSurveyTexts } from '@/lib/dealer-surveys/service.server';
import { DEFAULT_SURVEY_RANGE, SURVEY_RANGES } from '@/lib/dealer-surveys/types';

export const dynamic = 'force-dynamic';

/** GET — bir açık uçlu sorunun TÜM yanıtları (imleçli, aramalı). Eskiden yalnız son 20 görünüyordu. */
export const GET = defineRoute(
  {
    name: 'dealer.surveys.texts',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'dealer_surveys',
    rateLimit: 'read',
    params: z.object({ id: z.string().trim().min(1).max(64) }),
    query: z.object({
      questionId: z.string().trim().min(1).max(64),
      range: z.enum(SURVEY_RANGES).optional().default(DEFAULT_SURVEY_RANGE),
      cursor: z.string().max(200).optional(),
      q: z.string().max(100).optional(),
      dealerId: z.string().optional(),
    }),
  },
  async ({ tenant, params, query }) =>
    ok(
      await listSurveyTexts(tenant.dealerId, params.id, { questionId: query.questionId, range: query.range, cursor: query.cursor, q: query.q }),
      { legacySpread: true }
    )
);
