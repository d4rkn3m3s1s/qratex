import { defineRoute, ok } from '@/lib/http/define-route';
import { loadDealerOffers } from '@/lib/dealer/offers/load.server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/offers — Teklifler BFF (Pazarlama → Teklifler): kısa süreli teklifler,
 * mutlu saatler, kişiye özel teklifler ve telafi şablonları tek yanıtta. Sayfanın SSR'ı da
 * aynı yükleyiciyi çağırır. Bölüm bazlı durum (`ready | disabled | error`).
 * ADMIN yalnız `?dealerId=` ile ve salt-okunur (defineRoute kiracı kuralı).
 */
export const GET = defineRoute(
  {
    name: 'dealer.offers.overview',
    roles: ['DEALER', 'ADMIN'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER', 'ADMIN'] },
    rateLimit: 'read',
  },
  async ({ tenant }) => ok(await loadDealerOffers(tenant.dealerId))
);
