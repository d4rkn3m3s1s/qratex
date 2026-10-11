/** POST /api/dealer/automation/alerts/preview — kaydedilmemiş eşiklerle radar değerlendirmesi (vaka açmaz). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { evaluateAlertRules } from '@/lib/dealer-automation/alerts.server';
import { alertRulesSchema } from '@/lib/dealer-automation/alert-rules';
import { parseRadarRules } from '@/lib/dealer-queues/radar-rules';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.automation.alerts.preview',
    roles: ['DEALER'],
    tenant: 'dealer',
    schema: alertRulesSchema,
    rateLimit: { max: 30, windowMs: 60_000, by: 'user-or-ip' },
    maxBodyBytes: 4 * 1024,
  },
  async ({ tenant, body }) => ok(await evaluateAlertRules(tenant.dealerId, parseRadarRules(body)))
);
