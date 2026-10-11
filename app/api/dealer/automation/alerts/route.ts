/**
 * GET   /api/dealer/automation/alerts — kriz radarı eşikleri + canlı durum + son radar vakaları.
 * PATCH /api/dealer/automation/alerts — eşikleri kaydet (denetim kaydı; radar önbelleği tazelenir).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadAlertsOverview, saveAlertRules } from '@/lib/dealer-automation/alerts.server';
import { alertRulesSchema } from '@/lib/dealer-automation/alert-rules';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.automation.alerts.get', roles: ['DEALER'], tenant: 'dealer', rateLimit: 'read' },
  async ({ tenant }) => ok(await loadAlertsOverview(tenant.dealerId))
);

export const PATCH = defineRoute(
  {
    name: 'dealer.automation.alerts.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    schema: alertRulesSchema,
    rateLimit: 'mutation',
    maxBodyBytes: 4 * 1024,
  },
  async ({ tenant, body }) => ok({ rules: await saveAlertRules({ dealerId: tenant.dealerId, actorId: tenant.actorId }, body) })
);
