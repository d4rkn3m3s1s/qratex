/** GET /api/admin/surprise-box/coupons — kutuya eklenebilecek kuponlar (aktif, süresi ve hakkı kalan). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { usableCoupons } from '@/lib/admin-surprise-boxes/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.surpriseBox.coupons', roles: ['ADMIN'], rateLimit: 'read' },
  async () => ok(await usableCoupons())
);
