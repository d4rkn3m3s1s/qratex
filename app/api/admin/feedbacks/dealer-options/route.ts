/**
 * GET /api/admin/feedbacks/dealer-options?q=|id= — aranabilir bayi seçici (en fazla 20 sonuç).
 * Eski uç her istekte 5000 bayiyi listeye gömüyordu.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { searchDealerOptions } from '@/lib/admin-feedbacks/feed.server';

export const dynamic = 'force-dynamic';

const query = z.object({
  q: z.string().trim().max(80).optional(),
  id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
});

export const GET = defineRoute(
  { name: 'admin.feedbacks.dealerOptions', roles: ['ADMIN'], query, rateLimit: 'read' },
  async ({ query }) => ok(await searchDealerOptions(query.q, query.id))
);
