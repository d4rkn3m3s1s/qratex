/**
 * /api/admin/seo — SEO Motoru BFF (defineRoute: ADMIN + rate limit + modül kapısı).
 *  GET: önbelleği atlayan güncel ayarlar + `updatedAt` + son sağlık raporu.
 *  PUT: tek zod şeması, iyimser kilit (409), tehlikeli değişiklik onayı (428), denetimli kayıt.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { seoPutBodySchema } from '@/lib/admin-seo/contract';
import { getLastSeoHealth, getSeoState, saveSeo } from '@/lib/admin-seo/seo.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.seo.get', roles: ['ADMIN'], rateLimit: 'read' },
  async () => {
    const [state, health] = await Promise.all([getSeoState(), getLastSeoHealth()]);
    return ok({ state, health });
  }
);

export const PUT = defineRoute(
  { name: 'admin.seo.save', roles: ['ADMIN'], schema: seoPutBodySchema, rateLimit: 'mutation', maxBodyBytes: 200_000 },
  async ({ body, session, request }) => ok({ state: await saveSeo({ actor: actorFromSession(session), request }, body) })
);
