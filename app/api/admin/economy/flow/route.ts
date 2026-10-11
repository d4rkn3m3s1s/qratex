/** GET /api/admin/economy/flow?days=7|30|90 — PointsLedger kaynak/harcama akışı, arz, enflasyon. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { flowQuerySchema } from '@/lib/admin-economy/contract';
import { getEconomyFlow } from '@/lib/admin-economy/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.economy.flow', roles: ['ADMIN'], query: flowQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await getEconomyFlow(query.days))
);
