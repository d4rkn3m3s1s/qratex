/**
 * `GET /api/dealer/billing/checkout/status?session_id=` — Stripe Checkout dönüşünü doğrular.
 * Oturum bu bayiye aitse ve tamamlandıysa abonelik Stripe'tan taze okunup uzlaştırılır
 * (webhook gecikse de bayi ödediği planı hemen görür). İstemci `processing` iken kısa aralıklarla
 * en fazla ~20 sn yoklar; yabancı/geçersiz oturum `not_found`.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { confirmCheckoutReturn } from '@/lib/dealer-settings/billing.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.billing.checkout.status',
    roles: ['DEALER'],
    query: z.object({ session_id: z.string().regex(/^cs_[A-Za-z0-9_]{8,200}$/, 'Geçersiz ödeme oturumu') }),
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
  },
  async ({ user, query }) => ok(await confirmCheckoutReturn(user.id, query.session_id))
);
