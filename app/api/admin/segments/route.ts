/**
 * GET /api/admin/segments — segment kayıt defteri genel bakışı (CLV cron'unun segment ataması,
 * DB'de `groupBy`; 5 dk önbellek, `?fresh=1` tazeler). Eski uç 10.000 müşteriyi belleğe çekip
 * silinmiş yorumlarla kendi kurallarını uyguluyordu (rapor B1/B2/B5).
 */
import { defineRoute } from '@/lib/http/define-route';
import { getSegmentOverview } from '@/components/admin/a-segmentler/server/segments';
import { OverviewQuery } from '@/components/admin/a-segmentler/server/schemas';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.segments.overview', roles: ['ADMIN'], query: OverviewQuery, rateLimit: 'read' },
  async ({ query }) => getSegmentOverview({ fresh: query.fresh === '1' })
);
