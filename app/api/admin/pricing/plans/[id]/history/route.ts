/** GET /api/admin/pricing/plans/:id/history — planın denetim geçmişi (alan bazlı fark). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getPlanHistory } from '@/lib/admin-pricing/pricing.server';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.pricing.plans.history', roles: ['ADMIN'], params: Params, rateLimit: 'read' },
  async ({ params }) => ok(await getPlanHistory(params.id))
);
