/**
 * GET /api/dealer/customers/risk — Müşteriler → Risk sekmesi (eski /dealer/churn-risk).
 *
 * Yorum satırı değil MÜŞTERİ bazlı (aynı kişinin 3 yorumu 3 "müşteri" sayılmaz; anonim yüksek
 * riskli yorumlar ayrı sayılır). Her müşterinin en güncel sinyali, durumu (açık / ilgilenildi /
 * geri döndü), müşteri bazlı dağılım, 8 haftalık ortalama risk eğrisi, güvenilmez işaretli
 * yorumların dışlandığı sayı ve otomatik müdahale ayarı + son koşuları (işaretlenen müşteriler).
 * Modül kapısı: `churn_risk`.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getRiskOverview } from '@/lib/dealer-customers/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.customers.risk',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    module: 'churn_risk',
    rateLimit: 'read',
  },
  async ({ tenant }) => ok(await getRiskOverview(tenant.dealerId))
);
