/** POST /api/dealer/automation/remedy/templates — kapsam + tür başına tek teklif şablonu. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { createRemedyTemplate } from '@/lib/dealer-automation/remedy.server';
import { remedyTemplateCreateSchema } from '@/lib/dealer-automation/remedy-catalog';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.automation.remedy.templates.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'remedy_offers',
    schema: remedyTemplateCreateSchema,
    rateLimit: 'mutation',
    idempotent: true,
    maxBodyBytes: 4 * 1024,
  },
  async ({ tenant, body }) =>
    ok(await createRemedyTemplate({ dealerId: tenant.dealerId, actorId: tenant.actorId }, body), { status: 201 })
);
