/** POST /api/admin/coupons/batch — tek kullanımlık N kod (en çok 500); kodlar yanıtta döner (CSV istemcide). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { couponBatchSchema } from '@/lib/admin-coupons/contract';
import { createCouponBatch } from '@/lib/admin-coupons/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.coupons.batch', roles: ['ADMIN'], schema: couponBatchSchema, rateLimit: { max: 10, windowMs: 60_000, by: 'user' }, idempotent: true },
  async ({ body, session, request }) => ok(await createCouponBatch(body, actorFromSession(session), request), { status: 201 })
);
