/** POST { isActive, baseVersion } — yayına al / duraklat (409 sürüm çakışması). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { toggleBody } from '@/lib/campaigns-calendar/contract';
import { setConceptActive } from '@/lib/campaigns-calendar/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.campaigns-calendar.concepts.active', roles: ['ADMIN'], params: z.object({ id: z.string().min(1).max(64) }), schema: toggleBody, rateLimit: 'mutation' },
  async ({ params: p, body, user, request }) =>
    ok(await setConceptActive(p.id, body.isActive, body.baseVersion, { id: user.id, meta: getAuditRequestMeta(request) }))
);
