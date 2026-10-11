/** GET /api/admin/cards/[id]/detail — detay paneli: kart, izinli aksiyonlar, son tüketimler, zaman çizelgesi. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getCardDetail } from '@/lib/admin-cards/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.cards.detail', roles: ['ADMIN'], params: z.object({ id: z.string().min(1).max(64) }), rateLimit: 'read' },
  async ({ params }) => ok(await getCardDetail(params.id))
);
