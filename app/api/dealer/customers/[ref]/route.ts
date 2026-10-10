/**
 * GET /api/dealer/customers/[ref] — müşteri 360 çekmecesi: bu işletmedeki istatistikler,
 * etiketler, "neden riskli?" gerekçeleri, önerilen sonraki adım, ulaşılabilirlik (kampanya
 * tercihi + 7 günlük sıklık tavanı), sinyaller (QR + tüketim yorumları, yanıt durumu) ve
 * zaman çizelgesi (ziyaret, yorum, teklif, ileti).
 *
 * `ref` işletmeye bağlı şifreli referanstır; başka işletmenin referansı ya da bu işletmede
 * tüketimi olmayan kişi → 404 (varlık bile sızmaz).
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { RefParams } from '@/lib/dealer-customers/http';
import { decodeCustomerRef } from '@/lib/dealer-customers/ref';
import { getCustomerDetail } from '@/lib/dealer-customers/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.customers.detail', roles: ['DEALER', 'STAFF', 'ADMIN'], tenant: 'dealer', params: RefParams, rateLimit: 'read' },
  async ({ params, tenant }) => {
    const customerId = decodeCustomerRef(tenant.dealerId, params.ref);
    if (!customerId) throw new ApiError('NOT_FOUND', 'Müşteri bulunamadı.');
    const detail = await getCustomerDetail(tenant.dealerId, customerId);
    if (!detail) throw new ApiError('NOT_FOUND', 'Müşteri bulunamadı.');
    return ok(detail);
  }
);
