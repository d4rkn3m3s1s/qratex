import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { dealerHappyHourSchema } from '@/lib/dealer/offers/rules';
import { createDealerHappyHour } from '@/lib/dealer/offers/mutations.server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dealer/offers/happy-hours — işletmenin mutlu saatini oluşturur (İstanbul duvar
 * saati, çarpan 1,5–3). Puan çarpanı yalnız tüketim akışında uygulanır; burada yalnız tanım
 * yazılır + denetim izi. En fazla 10 açık mutlu saat.
 */
export const POST = defineRoute(
  {
    name: 'dealer.offers.happy-hours.create',
    roles: ['DEALER'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER'] },
    schema: dealerHappyHourSchema,
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    idempotent: true,
  },
  async ({ body, tenant, user, request }) =>
    ok(
      await createDealerHappyHour({
        dealerId: tenant.dealerId,
        actorId: user.id,
        input: body,
        audit: getAuditRequestMeta(request),
      }),
      { status: 201 }
    )
);
