/**
 * /api/admin/navigation — Navigasyon Stüdyosu BFF (defineRoute: ADMIN + rate limit + zod).
 *  GET: sıra + gruplar + görünürlük (rol başına) + sürümler + kapalı modüller + son değişiklik.
 *  PUT: C2 iyimser kilit (baseVersions yok → 428, uyuşmazlık → 409), tek transaction + tek denetim.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { navPutBodySchema } from '@/lib/admin-navigation/contract';
import { getNavigationState, saveNavigation } from '@/lib/admin-navigation/navigation.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.navigation.get', roles: ['ADMIN'], rateLimit: 'read' },
  async () => ok({ state: await getNavigationState() })
);

export const PUT = defineRoute(
  { name: 'admin.navigation.save', roles: ['ADMIN'], schema: navPutBodySchema, rateLimit: 'mutation', maxBodyBytes: 100_000 },
  async ({ body, session, request }) => ok({ state: await saveNavigation({ actor: actorFromSession(session), request }, body) })
);
