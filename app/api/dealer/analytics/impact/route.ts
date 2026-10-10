/**
 * `GET /api/dealer/analytics/impact` — Bayi Etki BFF'i (eski `/api/dealer/roi` +
 * `/api/dealer/business-outcomes` birleşimi).
 *
 * Dönem sözleşmesi `{range, compare}` (İstanbul günleri): `period` hazır dönemi ya da
 * `from`+`to` özel aralığı (≤ 366 gün), `compare=previous|yoy|none`. Varsayımlar (geri dönüş
 * penceresi, ortalama sepet) ve hedefler bayinin kayıtlı ayarlarından okunur.
 *
 * Varsayılan reddet: DEALER ve ADMIN (`?dealerId=`, salt-okunur); modül kapısı `roi` API
 * seviyesinde (ROI B7 / İş sonuçları B7). GET yan etkisiz, LLM yok.
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { ImpactDealerNotFoundError, loadDealerImpact } from '@/lib/dealer-impact/load';
import { impactQuerySchema, parseImpactSearch, recordParams } from '@/lib/dealer-impact/core';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.analytics.impact',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'roi',
    rateLimit: 'read',
    query: impactQuerySchema,
  },
  async ({ tenant, query }) => {
    const q = parseImpactSearch(recordParams(query as Record<string, string | undefined>));
    try {
      return ok(await loadDealerImpact(tenant.dealerId, q, { fresh: query.fresh === '1', readOnly: tenant.via === 'admin' }));
    } catch (error) {
      if (error instanceof ImpactDealerNotFoundError) throw new ApiError('NOT_FOUND', 'İşletme bulunamadı.');
      throw error;
    }
  }
);
