/** PATCH /api/admin/pricing/plans/:id — plan güncelle (iyimser kilit 409, arşivli plan 409, Stripe eşleme doğrulaması, denetimli). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { UpdatePlanBody } from '@/lib/admin-pricing/contract';
import { updatePlan } from '@/lib/admin-pricing/pricing.server';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

export const PATCH = defineRoute(
  { name: 'admin.pricing.plans.update', roles: ['ADMIN'], params: Params, schema: UpdatePlanBody, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await updatePlan(actionCtx(session, request), params.id, body))
);
