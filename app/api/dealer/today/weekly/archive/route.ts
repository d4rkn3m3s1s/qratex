/**
 * `GET /api/dealer/today/weekly/archive?before=YYYY-MM-DD&limit=8` — tamamlanmış haftaların
 * arşivi (yeni → eski), imleçli sayfalama. Eski `/dealer/weekly-brief`'in sabit `take: 12`
 * listesinin yerine (dealer_weekly-brief.md #17).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { WeeklyRangeError, loadWeeklyArchive } from '@/lib/dealer-today/weekly';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.today.weekly.archive',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
    query: z.object({
      before: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      limit: z.coerce.number().int().min(1).max(26).optional(),
      dealerId: z.string().optional(),
    }),
  },
  async ({ tenant, query }) => {
    try {
      return ok(await loadWeeklyArchive(tenant.dealerId, query.before ?? null, { limit: query.limit }));
    } catch (error) {
      if (error instanceof WeeklyRangeError) throw new ApiError('VALIDATION', error.message);
      throw error;
    }
  }
);
