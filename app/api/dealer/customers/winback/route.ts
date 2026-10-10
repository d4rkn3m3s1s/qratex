/**
 * GET /api/dealer/customers/winback — Müşteriler → Geri kazanım sekmesi (eski /dealer/radar).
 *
 * Uyuyan müşteriler sabit "30 gün" yerine müşterinin KENDİ ziyaret ritmine göre bantlanır
 * (uyanmak üzere / uyuyor / kayıp) ve "geri kazanım önceliği"ne göre sıralanır (eski sorgu en
 * ESKİ 500 kaybı seçiyordu). Son 7 günde iletişim kurulanlar işaretlenir; son 30 günün
 * gönderim → geri dönüş → ciro sonucu atıfla gelir. Modül kapısı: `customer_radar`.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getWinBackOverview } from '@/lib/dealer-customers/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.customers.winback',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    module: 'customer_radar',
    rateLimit: 'read',
  },
  async ({ tenant }) => ok(await getWinBackOverview(tenant.dealerId))
);
