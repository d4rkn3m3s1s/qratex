/**
 * /api/admin/pages — İçerik sayfaları (CMS) BFF.
 *  GET: özet liste (durum filtresi, arama, sıralama, sayfalama, sayaçlar; tam içerik dönmez).
 *  POST: yeni sayfa (paylaşılan zod; slug çakışması 409).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { cmsCreateSchema, cmsListQuerySchema } from '@/lib/cms-pages/contract';
import { createCmsPage, listCmsPages } from '@/lib/cms-pages/pages.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.pages.list', roles: ['ADMIN'], query: cmsListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listCmsPages(query))
);

export const POST = defineRoute(
  { name: 'admin.pages.create', roles: ['ADMIN'], schema: cmsCreateSchema, rateLimit: 'mutation', idempotent: true, maxBodyBytes: 300_000 },
  async ({ body, session, request }) => ok(await createCmsPage({ actor: actorFromSession(session), request }, body), { status: 201 })
);
