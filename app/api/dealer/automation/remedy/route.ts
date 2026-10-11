/**
 * GET   /api/dealer/automation/remedy — ayar + bu ayın sonuçları + teklif kataloğu.
 * PATCH /api/dealer/automation/remedy — ayarı kaydet (tam sayı, aralık, denetim kaydı).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadRemedyOverview, updateRemedyConfig } from '@/lib/dealer-automation/remedy.server';
import { remedyConfigSchema } from '@/lib/dealer-automation/remedy-config';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.automation.remedy.get', roles: ['DEALER'], tenant: 'dealer', module: 'remedy_offers', rateLimit: 'read' },
  async ({ tenant }) => ok(await loadRemedyOverview(tenant.dealerId))
);

export const PATCH = defineRoute(
  {
    name: 'dealer.automation.remedy.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'remedy_offers',
    schema: remedyConfigSchema,
    rateLimit: 'mutation',
    maxBodyBytes: 8 * 1024,
  },
  async ({ tenant, body }) => ok({ config: await updateRemedyConfig({ dealerId: tenant.dealerId, actorId: tenant.actorId }, body) })
);
