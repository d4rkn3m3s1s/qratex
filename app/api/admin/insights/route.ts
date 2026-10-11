/**
 * GET /api/admin/insights — sektör kırılımı (geriye uyum adresi).
 *
 * Eskiden hiçbir istemcinin çağırmadığı, sayfadan farklı semantikli (uncategorized dahil, `AVG`,
 * tüm zamanların `scanCount` sayacı) kopya bir uçtu (insights B8). Artık Admin Analitik'in
 * Sektör bölümüyle AYNI yükleyiciyi kullanır: `/api/admin/analytics/sectors` ile birebir aynı
 * dönem/süzgeç sözleşmesi, k-anonimlik bayrağı ve önbellek. Varsayılan reddet (`defineRoute`,
 * yalnız ADMIN + admin kapısı) ve `insights_global` modül kapısı uygulanır.
 */
import { defineRoute, ok, ApiError } from '@/lib/http/define-route';
import { adminAnalyticsQuerySchema, parseAdminAnalyticsSearch } from '@/lib/admin-analytics/params';
import { loadAdminSection } from '@/lib/admin-analytics/load';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.insights.sectors',
    roles: ['ADMIN'],
    rateLimit: 'read',
    query: adminAnalyticsQuerySchema,
    module: 'insights_global',
  },
  async ({ query, request }) => {
    if (query.fresh === '1') throw new ApiError('BAD_REQUEST', 'Yenileme için /api/admin/analytics/sectors?fresh=1 kullanın.');
    const q = parseAdminAnalyticsSearch(request.nextUrl.searchParams);
    return ok(await loadAdminSection('sectors', q));
  }
);
