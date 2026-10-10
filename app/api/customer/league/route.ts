/**
 * GET /api/customer/league — Oyna → Lig BFF'i (`/customer/leaderboard` sayfasının tek veri ucu).
 *
 *   ?category=points|feedbacks|badges|referrals  (varsayılan points)
 *   &period=week|season|all                       (varsayılan week)
 *   &page=1..                                     (25'lik sayfalar)
 *
 * Varsayılan reddet: yalnız CUSTOMER (rol DB'den, requireAuth), `rewards` modül kapısı + menü
 * görünürlüğü, okuma rate limit'i, zod sorgu doğrulaması. Yanıt zarf v2 (`data` = LeagueBoardDTO).
 * GET'te LLM yok; hesap `lib/league-board/server.ts`'te, ağır kısım önbellekte.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { assertMenuItemVisible } from '@/lib/module-gate';
import { LEAGUE_CATEGORIES, LEAGUE_PERIODS } from '@/lib/league-board/periods';
import { buildLeagueBoard, LeagueViewerNotFoundError } from '@/lib/league-board/server';

export const dynamic = 'force-dynamic';

const LeagueQuery = z.object({
  category: z.enum(LEAGUE_CATEGORIES).default('points'),
  period: z.enum(LEAGUE_PERIODS).default('week'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const GET = defineRoute(
  {
    name: 'customer.league.board',
    roles: ['CUSTOMER'],
    module: 'rewards',
    rateLimit: 'read',
    query: LeagueQuery,
  },
  async ({ user, query, request }) => {
    const hidden = await assertMenuItemVisible('leaderboard', 'customer', {
      userId: user.id,
      request,
      routeKey: 'customer.league.board',
    });
    if (hidden) throw new ApiError('MODULE_DISABLED', 'Lig sayfası yönetici tarafından geçici olarak kapatıldı.');
    try {
      const board = await buildLeagueBoard({
        viewerId: user.id,
        category: query.category,
        period: query.period,
        page: query.page,
      });
      return ok(board);
    } catch (err) {
      if (err instanceof LeagueViewerNotFoundError) throw new ApiError('NOT_FOUND', err.message);
      throw err;
    }
  }
);
