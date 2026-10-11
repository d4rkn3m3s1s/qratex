/** GET (detay + etki + geçmiş) / PUT (tam düzenleme, baseVersion zorunlu → 409) */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { writeCampaignBody } from '@/lib/campaigns-calendar/contract';
import { getCampaignDetail, updateCampaign } from '@/lib/campaigns-calendar/server';

export const dynamic = 'force-dynamic';
const params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.campaigns-calendar.campaigns.detail', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params: p }) => ok(await getCampaignDetail(p.id))
);

export const PUT = defineRoute(
  { name: 'admin.campaigns-calendar.campaigns.update', roles: ['ADMIN'], params, schema: writeCampaignBody, rateLimit: 'mutation' },
  async ({ params: p, body, user, request }) =>
    ok(await updateCampaign(p.id, body.data, body.baseVersion, { id: user.id, meta: getAuditRequestMeta(request) }))
);
