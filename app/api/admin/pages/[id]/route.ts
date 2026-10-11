/**
 * /api/admin/pages/[id]
 *  GET: tam sayfa. PATCH: düzenle (iyimser kilit `expectedUpdatedAt` → 409).
 *  DELETE: yalnız taslak (yayındaki sayfa 409); içerik denetim izinde kalır.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { cmsDeleteSchema, cmsUpdateSchema } from '@/lib/cms-pages/contract';
import { deleteCmsPage, getCmsPage, updateCmsPage } from '@/lib/cms-pages/pages.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.pages.get', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params: p }) => ok({ page: await getCmsPage(p.id) })
);

export const PATCH = defineRoute(
  { name: 'admin.pages.update', roles: ['ADMIN'], params, schema: cmsUpdateSchema, rateLimit: 'mutation', maxBodyBytes: 300_000 },
  async ({ params: p, body, session, request }) => ok(await updateCmsPage({ actor: actorFromSession(session), request }, p.id, body))
);

export const DELETE = defineRoute(
  { name: 'admin.pages.delete', roles: ['ADMIN'], params, schema: cmsDeleteSchema, rateLimit: 'mutation' },
  async ({ params: p, body, session, request }) =>
    ok(await deleteCmsPage({ actor: actorFromSession(session), request }, p.id, body.expectedUpdatedAt))
);
