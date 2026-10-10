import { defineRoute, ok } from '@/lib/http/define-route';
import { getNearbyPlaces } from '@/lib/places/data.server';
import { assertPlacesAccess } from '@/lib/places/gate.server';
import { nearbyQuerySchema } from '@/lib/places/query-schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/places/nearby — Keşfet → Yakınımda (BFF).
 * Konum verilirse yarıçaptaki mekânlar (mesafeye/puana göre), verilmezse "konumsuz göz at"
 * (puana göre). Sayfalı (`offset`, 20'şer). Konum sunucuda ~110 m'ye yuvarlanır.
 */
export const GET = defineRoute(
  {
    name: 'customer.places.nearby',
    roles: ['CUSTOMER'],
    rateLimit: 'read',
    query: nearbyQuerySchema,
  },
  async ({ user, query, request }) => {
    await assertPlacesAccess(user.id, request);
    const data = await getNearbyPlaces(user.id, {
      lat: query.lat ?? null,
      lng: query.lng ?? null,
      radiusKm: query.radius,
      category: query.category ?? null,
      q: query.q ?? null,
      openNow: query.open,
      boost: query.boost,
      sort: query.sort,
      offset: query.offset ?? 0,
    });
    return ok(data);
  },
);
