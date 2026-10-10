import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { PERSONAL_DAILY_LIMIT, personalOfferSchema } from '@/lib/dealer/offers/rules';
import { sendPersonalOffer } from '@/lib/dealer/offers/mutations.server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dealer/offers/personal — kişiye özel teklif (B5 / P0-22): hedef müşteriye bağlı
 * kaynaksız telafi teklifi. Müşteri `ref` ile seçilir (ham kimlik istemciye gitmez); yalnız bu
 * işletmeyi ziyaret etmiş ve kampanya bildirimini açık tutan müşteri; seçenekler telafi şablonu
 * allowlist'inden. Telafi modülü kapalıysa 403. Bayi başına günde en fazla 20.
 */
export const POST = defineRoute(
  {
    name: 'dealer.offers.personal.send',
    roles: ['DEALER'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER'] },
    module: 'remedy_offers',
    schema: personalOfferSchema,
    rateLimit: { max: PERSONAL_DAILY_LIMIT, windowMs: 24 * 60 * 60_000, by: 'user' },
    idempotent: true,
  },
  async ({ body, tenant, user, request }) =>
    ok(
      await sendPersonalOffer({
        dealerId: tenant.dealerId,
        actorId: user.id,
        input: body,
        audit: getAuditRequestMeta(request),
      }),
      { status: 201 }
    )
);
