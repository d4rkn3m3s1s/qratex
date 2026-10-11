/**
 * GET /api/admin/feedbacks/stats — sekme sayaçları + KPI şeridi (tek SQL). Sayfa ve
 * sıralamadan bağımsızdır; istemci sayfa değişiminde yeniden çağırmaz.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { feedFiltersSchema } from '@/lib/admin-feedbacks/contract';
import { getFeedStats } from '@/lib/admin-feedbacks/feed.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.feedbacks.stats', roles: ['ADMIN'], query: feedFiltersSchema, rateLimit: 'read' },
  async ({ query }) => ok(await getFeedStats(query))
);
