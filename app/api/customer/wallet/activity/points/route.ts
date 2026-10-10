import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getPointsHistory, getPointsOverview } from '@/lib/customer-wallet/activity/points-history';
import { SOURCE_GROUPS } from '@/lib/customer-wallet/activity/sources';

export const dynamic = 'force-dynamic';

const Query = z.object({
  cursor: z.string().max(200).optional(),
  dir: z.enum(['all', 'earn', 'spend']).optional().default('all'),
  group: z.enum(SOURCE_GROUPS).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * GET /api/customer/wallet/activity/points — puan defteri (imleçli).
 * İlk sayfada (imleçsiz) `overview` da döner: bakiye, bu ay kazanılan/harcanan, bekleyen,
 * ayrıntısı listelenmeyen bakiye. Filtre uygulanmış olsa da overview filtreden bağımsızdır.
 */
export const GET = defineRoute(
  { name: 'customer.wallet.activity.points', roles: ['CUSTOMER'], query: Query, rateLimit: 'read' },
  async ({ user, query }) => {
    const [page, overview] = await Promise.all([
      getPointsHistory(prisma, user.id, { cursor: query.cursor ?? null, direction: query.dir, group: query.group ?? null, limit: query.limit }),
      query.cursor ? Promise.resolve(null) : getPointsOverview(prisma, user.id),
    ]);
    return ok({ ...page, overview });
  },
);
