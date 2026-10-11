/**
 * `GET /api/dealer/billing/details` — Stripe CANLI ayrıntılar: dönem sonunda iptal, deneme bitişi,
 * ödeme yöntemi (marka + son 4 hane), son 12 fatura (barındırılan sayfa + PDF bağlantısı).
 * Sayfa özetinden ayrı ve ertelenmiş yüklenir; Stripe kapalıysa `available: false`.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadBillingDetails } from '@/lib/dealer-settings/billing.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.billing.details', roles: ['DEALER'], rateLimit: { max: 30, windowMs: 60_000, by: 'user' } },
  async ({ user }) => ok(await loadBillingDetails(user.id))
);
