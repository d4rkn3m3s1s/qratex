/**
 * POST /api/admin/cards/bulk — blokla / blok kaldır / arşivle (tek kart, seçim ya da partinin tamamı).
 * Her kart durum makinesinden geçer; uygun olmayanlar gerekçesiyle atlanır. `dryRun` → yalnız önizleme.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { bulkBodySchema } from '@/lib/admin-cards/contract';
import { bulkCards, routeActor } from '@/lib/admin-cards/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.cards.bulk', roles: ['ADMIN'], schema: bulkBodySchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await bulkCards(body, routeActor(session), getAuditRequestMeta(request)))
);
