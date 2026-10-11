/** POST /api/admin/pricing/stripe/create-price — planın fiyatıyla Stripe'ta yeni Price oluştur ve eşle (idempotent, denetimli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { StripeCreatePriceBody } from '@/lib/admin-pricing/contract';
import { createStripePriceForPlan } from '@/lib/admin-pricing/pricing.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.pricing.stripe.create', roles: ['ADMIN'], schema: StripeCreatePriceBody, rateLimit: { max: 10, windowMs: 60_000, by: 'user' } },
  async ({ body, session, request }) => ok(await createStripePriceForPlan(actionCtx(session, request), body.planId, body.expectedUpdatedAt))
);
