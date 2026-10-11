/** POST /api/admin/badges/bulk — toplu etkinleştir / pasifleştir / arşivle (kazanım varsa onaylı). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { badgeBulkSchema } from '@/lib/admin-badges/contract';
import { runBulk } from '@/lib/admin-badges/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.badges.bulk', roles: ['ADMIN'], schema: badgeBulkSchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await runBulk(body, actorFromSession(session), request))
);
