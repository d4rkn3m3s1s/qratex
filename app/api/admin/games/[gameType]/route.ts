import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getGameDetail } from '@/lib/admin-games/server';

export const dynamic = 'force-dynamic';

/** GET /api/admin/games/:gameType — 14 günlük eğilim, skor dağılımı, bütünlük sinyalleri, doğrulayıcı, değişiklik geçmişi. */
export const GET = defineRoute(
  {
    name: 'admin.games.detail',
    roles: ['ADMIN'],
    rateLimit: 'read',
    params: z.object({ gameType: z.string().min(1).max(64) }),
  },
  async ({ params }) => ok(await getGameDetail(params.gameType))
);
