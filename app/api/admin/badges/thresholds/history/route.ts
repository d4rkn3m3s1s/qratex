/** GET /api/admin/badges/thresholds/history?page= — eşik değişiklik geçmişi (denetim kaydından). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getThresholdHistory } from '@/lib/admin-badges/thresholds.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.badges.thresholds.history',
    roles: ['ADMIN'],
    query: z.object({ page: z.coerce.number().int().min(1).max(1000).catch(1).default(1) }),
    rateLimit: 'read',
  },
  async ({ query }) => ok(await getThresholdHistory(query.page))
);
