/** POST /api/admin/store/cosmetics/seed — Demo seti: yalnız EKSİK ürünleri satışta-değil olarak ekler; mevcutları ezmez. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { seedMissingDemos } from '@/lib/admin-store/cosmetics.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.store.cosmetics.seed', roles: ['ADMIN'], rateLimit: 'mutation', idempotent: true },
  async ({ session, request }) => ok(await seedMissingDemos(actorFromSession(session), request))
);
