import { defineRoute, ok } from '@/lib/http/define-route';
import { getTopPlaces } from '@/lib/places/data.server';
import { assertPlacesAccess } from '@/lib/places/gate.server';
import { topQuerySchema } from '@/lib/places/query-schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/places/top — Keşfet → En iyiler (BFF). Bayes skorlu, güvenilir-oy
 * sıralaması (kişi başı tek oy; anonim/işaretli/gölge-ban yorumlar hariç), kategori ve
 * 30/90 gün penceresi. Kullanıcıdan bağımsız kısım Redis'te 10 dk.
 */
export const GET = defineRoute(
  {
    name: 'customer.places.top',
    roles: ['CUSTOMER'],
    rateLimit: 'read',
    query: topQuerySchema,
  },
  async ({ user, query, request }) => {
    await assertPlacesAccess(user.id, request);
    return ok(await getTopPlaces(user.id, { category: query.category ?? null, window: query.window }));
  },
);
