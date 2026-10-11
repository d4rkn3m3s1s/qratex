/**
 * PATCH  /api/dealer/automation/remedy/templates/[id] — değerler, etiket, aktiflik, sıra.
 * DELETE /api/dealer/automation/remedy/templates/[id] — onaylı silme (bağımlı kayıt yok).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { deleteRemedyTemplate, updateRemedyTemplate } from '@/lib/dealer-automation/remedy.server';
import { remedyTemplateUpdateSchema } from '@/lib/dealer-automation/remedy-catalog';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

export const PATCH = defineRoute(
  {
    name: 'dealer.automation.remedy.templates.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'remedy_offers',
    params,
    schema: remedyTemplateUpdateSchema,
    rateLimit: 'mutation',
    maxBodyBytes: 4 * 1024,
  },
  async ({ tenant, params: p, body }) =>
    ok(await updateRemedyTemplate({ dealerId: tenant.dealerId, actorId: tenant.actorId }, p.id, body))
);

export const DELETE = defineRoute(
  { name: 'dealer.automation.remedy.templates.delete', roles: ['DEALER'], tenant: 'dealer', module: 'remedy_offers', params, rateLimit: 'mutation' },
  async ({ tenant, params: p }) => ok(await deleteRemedyTemplate({ dealerId: tenant.dealerId, actorId: tenant.actorId }, p.id))
);
