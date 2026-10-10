import { defineRoute, ok } from '@/lib/http/define-route';
import { getDeals } from '@/lib/places/deals.server';
import { assertPlacesAccess } from '@/lib/places/gate.server';
import { coordsQuerySchema } from '@/lib/places/query-schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/places/deals — Keşfet → Fırsatlar (BFF): mutlu saatler (canlılık puanlamayla
 * aynı fonksiyon, İstanbul saati), sezonluk etkinlikler + görev ilerlemesi (talep süresi dahil),
 * kısa süreli teklifler (yakın + kaydedilen mekânlar) ve kullanıcıya gelen kampanya mesajları.
 */
export const GET = defineRoute(
  {
    name: 'customer.places.deals',
    roles: ['CUSTOMER'],
    rateLimit: 'read',
    query: coordsQuerySchema,
  },
  async ({ user, query, request }) => {
    await assertPlacesAccess(user.id, request, 'deals');
    return ok(await getDeals(user.id, { lat: query.lat ?? null, lng: query.lng ?? null }));
  },
);
