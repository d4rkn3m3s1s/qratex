/** POST /api/admin/pricing/plans/:id/restore — arşivden geri al (plan pasif döner, denetimli). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { restorePlan } from '@/lib/admin-pricing/pricing.server';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.pricing.plans.restore', roles: ['ADMIN'], params: Params, rateLimit: 'mutation' },
  async ({ params, session, request }) => ok(await restorePlan(actionCtx(session, request), params.id))
);
