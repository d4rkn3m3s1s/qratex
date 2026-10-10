import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { flashPatchSchema } from '@/lib/dealer/offers/rules';
import { stopFlashOffer } from '@/lib/dealer/offers/mutations.server';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/dealer/offers/flash/[id] — `{ action: 'stop' }`: canlı ya da planlı teklifi durdurur.
 * Silme yoktur (geçmiş arşiv olarak kalır). Durdurulan teklif müşteri listelerinden anında düşer
 * (müşteri uçları `isActive` + pencere ile süzer). Koşullu güncelleme: zaten bittiyse 409.
 */
export const PATCH = defineRoute(
  {
    name: 'dealer.offers.flash.stop',
    roles: ['DEALER'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER'] },
    params: z.object({ id: z.string().trim().min(1).max(64) }),
    schema: flashPatchSchema,
    rateLimit: 'mutation',
  },
  async ({ params, tenant, user, request }) =>
    ok(
      await stopFlashOffer({
        dealerId: tenant.dealerId,
        actorId: user.id,
        offerId: params.id,
        audit: getAuditRequestMeta(request),
      })
    )
);
