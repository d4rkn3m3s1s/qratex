import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { loadDailyWordStats } from '@/lib/games/validators/daily-word-api';

export const dynamic = 'force-dynamic';

/** GET — oyuncunun Günün Kelimesi istatistiği (yalnız sıralı denemeler): oynanan, kazanma %, seri, dağılım. */
export const GET = defineRoute(
  {
    name: 'customer.games.daily-word.stats',
    roles: ['CUSTOMER'],
    rateLimit: { max: 60, windowMs: 60_000, by: 'user' },
  },
  async ({ user }) => ok({ stats: await loadDailyWordStats(prisma, user.id) })
);
