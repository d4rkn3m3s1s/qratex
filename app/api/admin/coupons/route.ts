/**
 * Kupon yönetimi (admin) — Dalga 2.
 *  GET    /api/admin/coupons?q=&status=&sort=&page=&size= → { items (türetilmiş durum), total, counts }
 *  POST   /api/admin/coupons → oluştur (tek zod şeması, Türkçe hatalar, tx + denetim, P2002 → 409)
 *  DELETE /api/admin/coupons?id= → eski sözleşme: idempotent pasifleştirme (yeni istemci PATCH kullanır)
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { couponCreateSchema, couponListQuerySchema } from '@/lib/admin-coupons/contract';
import { createCoupon, deactivateCoupon, listCoupons } from '@/lib/admin-coupons/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.coupons.list', roles: ['ADMIN'], query: couponListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listCoupons(query))
);

export const POST = defineRoute(
  { name: 'admin.coupons.create', roles: ['ADMIN'], schema: couponCreateSchema, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await createCoupon(body, actorFromSession(session), request), { status: 201 })
);

export const DELETE = defineRoute(
  { name: 'admin.coupons.deactivate', roles: ['ADMIN'], query: z.object({ id: z.string().min(1, 'id gerekli').max(64) }), rateLimit: 'mutation' },
  async ({ query, session, request }) => ok(await deactivateCoupon(query.id, actorFromSession(session), request))
);
