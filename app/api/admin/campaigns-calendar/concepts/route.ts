/** GET (sayfalı liste) / POST (oluştur) — /api/admin/campaigns-calendar/concepts */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { listQuerySchema, writeConceptBody } from '@/lib/campaigns-calendar/contract';
import { createConcept, listConcepts } from '@/lib/campaigns-calendar/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.campaigns-calendar.concepts.list', roles: ['ADMIN'], query: listQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listConcepts({ filter: query.filter, q: query.q, page: query.page, size: query.size }))
);

export const POST = defineRoute(
  { name: 'admin.campaigns-calendar.concepts.create', roles: ['ADMIN'], schema: writeConceptBody, rateLimit: 'mutation', idempotent: true },
  async ({ body, user, request }) =>
    ok(await createConcept(body.data, { id: user.id, meta: getAuditRequestMeta(request) }), { status: 201 })
);
