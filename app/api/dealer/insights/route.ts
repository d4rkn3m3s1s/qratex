/**
 * `GET /api/dealer/insights` — İçgörüler BFF'i (deterministik metrikler, temalar, sinyaller,
 * kural uyarıları, birleşik öneriler + saklı AI anlatısı).
 *
 * Varsayılan reddet: DEALER (kendi işletmesi) ve ADMIN (yalnız `?dealerId=` ile, salt-okunur).
 * Modül kapısı `ai_features` (kayıttaki menü modülüyle aynı; eskiden yalnız menü gizleniyordu).
 * GET yan etkisizdir ve LLM ÇAĞIRMAZ; `?fresh=1` 5 dk'lık toplama önbelleğini atlar.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { insightsQuerySchema, objectParams, parseInsightsSearch } from '@/lib/dealer-insights/params';
import { loadInsights } from '@/lib/dealer-insights/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.insights',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'ai_features',
    rateLimit: 'read',
    query: insightsQuerySchema,
  },
  async ({ tenant, query }) => {
    const q = parseInsightsSearch(objectParams(query as Record<string, unknown>));
    return ok(
      await loadInsights(tenant.dealerId, q, {
        fresh: query.fresh === '1',
        locale: query.lang === 'en' ? 'en' : 'tr',
        canWrite: tenant.via !== 'admin',
      })
    );
  }
);
