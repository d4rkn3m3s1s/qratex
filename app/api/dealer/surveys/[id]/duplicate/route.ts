import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { duplicateDealerSurvey } from '@/lib/dealer-surveys/service.server';

export const dynamic = 'force-dynamic';

/** POST — anketi DURDURULMUŞ kopya olarak çoğaltır (yanıtlar kopyalanmaz; kota uygulanır). */
export const POST = defineRoute(
  {
    name: 'dealer.surveys.duplicate',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'dealer_surveys',
    rateLimit: 'mutation',
    params: z.object({ id: z.string().trim().min(1).max(64) }),
  },
  async ({ tenant, params }) => ok({ survey: await duplicateDealerSurvey(tenant.dealerId, params.id) }, { status: 201, legacySpread: true })
);
