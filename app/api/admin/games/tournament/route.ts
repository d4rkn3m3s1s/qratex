import { defineRoute, ok } from '@/lib/http/define-route';
import { getTournamentOverview } from '@/lib/admin-games/server';

export const dynamic = 'force-dynamic';

/** GET /api/admin/games/tournament — haftanın turnuvası: canlı ilk 10, rotasyon, geçen haftanın ödül talepleri. */
export const GET = defineRoute(
  { name: 'admin.games.tournament', roles: ['ADMIN'], rateLimit: 'read' },
  async () => ok(await getTournamentOverview())
);
