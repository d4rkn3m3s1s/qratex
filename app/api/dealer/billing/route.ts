/**
 * `GET /api/dealer/billing` — bayinin abonelik durumu + seçilebilir planlar + kota kullanımı
 * (Ayarlar › Abonelik). Sayfa ilk yüklemede aynı veriyi (`loadBillingSummary`) sunucuda üretir.
 *
 * `current.hasSubscription`: faturalanabilir bir abonelik var → yeni Checkout değil
 * "Planı değiştir" akışı kullanılır (çift abonelik engeli, P0-29). `stripePriceId` sızmaz.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadBillingSummary } from '@/lib/dealer-settings/billing.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.billing.get', roles: ['DEALER'], rateLimit: { max: 120, windowMs: 60_000, by: 'user' } },
  async ({ user }) => ok(await loadBillingSummary(user.id))
);
