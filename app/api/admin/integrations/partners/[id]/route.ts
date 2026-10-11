/** GET/PATCH /api/admin/integrations/partners/[id] — detay (anahtarlar, webhook'lar, bayiler, etkinlik) ve düzenleme. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { ctxFrom } from '@/lib/integrations/route-ctx';
import { UpdatePartnerBody } from '@/lib/integrations/contract';
import { getPartnerDetail, updatePartner } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';
const Params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.integrations.partners.detail', roles: ['ADMIN'], params: Params, rateLimit: 'read' },
  async ({ params }) => ok(await getPartnerDetail(params.id))
);

export const PATCH = defineRoute(
  { name: 'admin.integrations.partners.update', roles: ['ADMIN'], params: Params, schema: UpdatePartnerBody, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await updatePartner(ctxFrom(session, request), params.id, body))
);
