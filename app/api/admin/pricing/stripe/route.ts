/**
 * POST /api/admin/pricing/stripe — Stripe fiyat eşlemesini doğrula. `{ planIds }` kayıtlı planları,
 * `{ stripePriceId, price, currency, interval }` formdaki kaydedilmemiş değeri karşılaştırır. Yazmaz.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { StripeVerifyBody } from '@/lib/admin-pricing/contract';
import { verifyStripe } from '@/lib/admin-pricing/pricing.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.pricing.stripe.verify', roles: ['ADMIN'], schema: StripeVerifyBody, rateLimit: { max: 20, windowMs: 60_000, by: 'user' } },
  async ({ body }) => ok(await verifyStripe(body))
);
