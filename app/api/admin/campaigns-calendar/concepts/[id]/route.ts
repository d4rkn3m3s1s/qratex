/** GET (detay + etki + geçmiş) / PUT (tam düzenleme, baseVersion zorunlu → 409) */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { writeConceptBody } from '@/lib/campaigns-calendar/contract';
import { getConceptDetail, updateConcept } from '@/lib/campaigns-calendar/server';

export const dynamic = 'force-dynamic';
const params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.campaigns-calendar.concepts.detail', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params: p }) => ok(await getConceptDetail(p.id))
);

export const PUT = defineRoute(
  { name: 'admin.campaigns-calendar.concepts.update', roles: ['ADMIN'], params, schema: writeConceptBody, rateLimit: 'mutation' },
  async ({ params: p, body, user, request }) =>
    ok(await updateConcept(p.id, body.data, body.baseVersion, { id: user.id, meta: getAuditRequestMeta(request) }))
);
