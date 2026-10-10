/**
 * GET /api/dealer/customers/summary — Müşteriler üst şeridi: toplam, aktif (30 gün), yeni,
 * riskli, uyuyan (banda göre), etiket sayıları, ciro, ortalama müşteri değeri, tekrar oranı ve
 * veri tazeliği (`calculatedAt`, 36 saati aşınca `stale`). Yalnız bu işletmenin verisi.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getSummary } from '@/lib/dealer-customers/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.customers.summary', roles: ['DEALER', 'STAFF', 'ADMIN'], tenant: 'dealer', rateLimit: 'read' },
  async ({ tenant }) => ok(await getSummary(tenant.dealerId))
);
