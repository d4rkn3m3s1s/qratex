/** GET /api/admin/coupons/stats — durum sayıları, 7/14 günlük kullanım, yakında bitecekler, kutu dağıtımı. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getCouponStats } from '@/lib/admin-coupons/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.coupons.stats', roles: ['ADMIN'], rateLimit: 'read' },
  async () => ok(await getCouponStats())
);
