/** GET /api/admin/dealers-health/[dealerId] — detay çekmecesi verisi. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { DealerParams, WindowQuery } from '@/components/admin/a-bayi-sagligi/server/schemas';
import { getDealerHealthDetail } from '@/components/admin/a-bayi-sagligi/server/detail';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.dealers-health.detail', roles: ['ADMIN'], params: DealerParams, query: WindowQuery, rateLimit: 'read' },
  async ({ params, query }) => ok(await getDealerHealthDetail(params.dealerId, query.window))
);
