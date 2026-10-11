/** GET /api/admin/cards/list — Fiziksel kartlar tablosu BFF'i (sunucu sayfalama, filtre, sıralama). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { cardListQuerySchema } from '@/lib/admin-cards/contract';
import { listCards } from '@/lib/admin-cards/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.cards.list', roles: ['ADMIN'], query: cardListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listCards(query))
);
