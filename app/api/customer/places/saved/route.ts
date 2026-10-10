import { defineRoute, ok } from '@/lib/http/define-route';
import { getSavedPlaces } from '@/lib/places/data.server';
import { assertPlacesAccess } from '@/lib/places/gate.server';
import { coordsQuerySchema } from '@/lib/places/query-schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/places/saved — Keşfet → Kaydettiklerim (BFF). Her mekân için canlı durum
 * (açık/kapalı, canlı çarpan, teklif), kişisel bağlam (ziyaret) ve konum verildiyse mesafe.
 * Boş durumda "son gittiğin mekânlar" önerileri (tek dokunuşla kaydet).
 */
export const GET = defineRoute(
  {
    name: 'customer.places.saved',
    roles: ['CUSTOMER'],
    rateLimit: 'read',
    query: coordsQuerySchema,
  },
  async ({ user, query, request }) => {
    await assertPlacesAccess(user.id, request);
    return ok(await getSavedPlaces(user.id, { lat: query.lat ?? null, lng: query.lng ?? null }));
  },
);
