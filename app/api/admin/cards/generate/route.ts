/**
 * POST /api/admin/cards/generate — üretim partisi (en çok 10.000 kart).
 * Parti + kartlar + denetim tek transaction; oluşturulan sayı `createMany` dönüşünden gelir
 * (atlanan çift kayıt yeniden üretilir, eksik kalırsa hiçbir şey yazılmaz).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { generateBodySchema } from '@/lib/admin-cards/contract';
import { generateBatch, routeActor } from '@/lib/admin-cards/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = defineRoute(
  {
    name: 'admin.cards.generate',
    roles: ['ADMIN'],
    schema: generateBodySchema,
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    idempotent: true,
  },
  async ({ body, session, request }) => ok(await generateBatch(body, routeActor(session), getAuditRequestMeta(request)), { status: 201 })
);
