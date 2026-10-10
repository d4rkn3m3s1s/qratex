import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { SAVED_LIMIT, savePlace, unsavePlace } from '@/lib/places/data.server';
import { assertPlacesAccess } from '@/lib/places/gate.server';
import { dealerParamsSchema } from '@/lib/places/query-schemas';

export const dynamic = 'force-dynamic';

/**
 * PUT    /api/customer/places/saved/:dealerId — mekânı kaydet (idempotent; yalnız herkese açık işletme).
 * DELETE /api/customer/places/saved/:dealerId — kayıttan çıkar (idempotent).
 * Kullanıcı başına en çok 200 kayıt; dakikada 60 yazma. Veri `CustomerFavoriteDealer` —
 * ana sayfadaki "Favorilerim" şeridi ile aynı tablo (tek doğruluk kaynağı).
 */
export const PUT = defineRoute(
  {
    name: 'customer.places.saved.put',
    roles: ['CUSTOMER'],
    rateLimit: 'mutation',
    params: dealerParamsSchema,
  },
  async ({ user, params, request }) => {
    await assertPlacesAccess(user.id, request);
    const r = await savePlace(user.id, params.dealerId);
    if (!r.ok) {
      if (r.reason === 'NOT_FOUND') throw new ApiError('NOT_FOUND', 'Mekân bulunamadı.');
      throw new ApiError('CONFLICT', `En fazla ${SAVED_LIMIT} mekân kaydedebilirsin. Yer açmak için birini çıkar.`, {
        details: { limit: SAVED_LIMIT },
      });
    }
    return ok({ dealerId: params.dealerId, saved: r.saved, count: r.count });
  },
);

export const DELETE = defineRoute(
  {
    name: 'customer.places.saved.delete',
    roles: ['CUSTOMER'],
    rateLimit: 'mutation',
    params: dealerParamsSchema,
  },
  async ({ user, params, request }) => {
    await assertPlacesAccess(user.id, request);
    const r = await unsavePlace(user.id, params.dealerId);
    return ok({ dealerId: params.dealerId, saved: r.saved, count: r.count });
  },
);
