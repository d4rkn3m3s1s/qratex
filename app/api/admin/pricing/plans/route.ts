/** POST /api/admin/pricing/plans — yeni plan (paylaşılan zod, tek öne çıkan kuralı, Stripe eşleme doğrulaması, denetimli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { PlanInput } from '@/lib/admin-pricing/contract';
import { createPlan } from '@/lib/admin-pricing/pricing.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.pricing.plans.create', roles: ['ADMIN'], schema: PlanInput, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await createPlan(actionCtx(session, request), body), { status: 201 })
);
