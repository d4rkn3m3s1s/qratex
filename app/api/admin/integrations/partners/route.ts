/** GET/POST /api/admin/integrations/partners — partnerler (anahtar/webhook sahibi varlık). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { ctxFrom } from '@/lib/integrations/route-ctx';
import { CreatePartnerBody, PartnerListQuery } from '@/lib/integrations/contract';
import { createPartner, listPartners } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.integrations.partners.list', roles: ['ADMIN'], query: PartnerListQuery, rateLimit: 'read' },
  async ({ query }) => ok({ items: await listPartners(query) })
);

export const POST = defineRoute(
  { name: 'admin.integrations.partners.create', roles: ['ADMIN'], schema: CreatePartnerBody, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await createPartner(ctxFrom(session, request), body), { status: 201 })
);
