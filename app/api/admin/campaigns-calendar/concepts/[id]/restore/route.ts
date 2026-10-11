/** POST { baseVersion } — arşivden çıkar (duraklatılmış döner). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { restoreBody } from '@/lib/campaigns-calendar/contract';
import { restoreConcept } from '@/lib/campaigns-calendar/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.campaigns-calendar.concepts.restore', roles: ['ADMIN'], params: z.object({ id: z.string().min(1).max(64) }), schema: restoreBody, rateLimit: 'mutation' },
  async ({ params: p, body, user, request }) =>
    ok(await restoreConcept(p.id, body.baseVersion, { id: user.id, meta: getAuditRequestMeta(request) }))
);
