/** POST { reason, baseVersion } — gerekçeli arşiv (silme yok; kayıt ve defter izi korunur). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { archiveBody } from '@/lib/campaigns-calendar/contract';
import { archiveCampaign } from '@/lib/campaigns-calendar/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.campaigns-calendar.campaigns.archive', roles: ['ADMIN'], params: z.object({ id: z.string().min(1).max(64) }), schema: archiveBody, rateLimit: 'mutation' },
  async ({ params: p, body, user, request }) =>
    ok(await archiveCampaign(p.id, body.reason, body.baseVersion, { id: user.id, meta: getAuditRequestMeta(request) }))
);
