/**
 * GET /api/admin/council/dealers?q= — hafif bayi seçici (yalnız id + ad; en fazla 20, sunucu tarafı arama).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { searchDealers } from '@/lib/council/sessions.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.council.dealers', roles: ['ADMIN'], query: z.object({ q: z.string().trim().max(80).optional() }), rateLimit: 'read' },
  async ({ query }) => ok({ items: await searchDealers(query.q) })
);
