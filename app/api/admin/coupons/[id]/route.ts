/**
 * GET   /api/admin/coupons/[id] — ayrıntı: kullanımlar, 14 günlük seri, kutuyla dağıtım, denetim.
 * PATCH /api/admin/coupons/[id] — düzenle / pasifleştir / yeniden etkinleştir (sürüm kontrollü).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { couponIdSchema, couponUpdateSchema } from '@/lib/admin-coupons/contract';
import { getCoupon, updateCoupon } from '@/lib/admin-coupons/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.coupons.detail', roles: ['ADMIN'], params: couponIdSchema, rateLimit: 'read' },
  async ({ params }) => ok(await getCoupon(params.id))
);

export const PATCH = defineRoute(
  { name: 'admin.coupons.update', roles: ['ADMIN'], params: couponIdSchema, schema: couponUpdateSchema, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await updateCoupon(params.id, body, actorFromSession(session), request))
);
