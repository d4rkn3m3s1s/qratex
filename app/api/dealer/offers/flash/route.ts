import { defineRoute, ok } from '@/lib/http/define-route';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { ApiError } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { flashCreateSchema } from '@/lib/dealer/offers/rules';
import { createFlashOffer } from '@/lib/dealer/offers/mutations.server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dealer/offers/flash — kısa süreli teklif oluştur (hemen ya da planlı).
 * Değer, süre ve başlangıç sunucuda doğrulanır; aynı anda en fazla 3 açık teklif.
 * Platform ayarı (`innovation.features.flashOffers`) kapalıysa 403 MODULE_DISABLED.
 */
export const POST = defineRoute(
  {
    name: 'dealer.offers.flash.create',
    roles: ['DEALER'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER'] },
    schema: flashCreateSchema,
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    idempotent: true,
  },
  async ({ body, tenant, user, request }) => {
    const cfg = await getInnovationPlatformConfig();
    if (cfg.features.flashOffers === false) {
      throw new ApiError('MODULE_DISABLED', 'Kısa süreli teklifler platformda geçici olarak kapalı.');
    }
    const result = await createFlashOffer({
      dealerId: tenant.dealerId,
      actorId: user.id,
      input: body,
      audit: getAuditRequestMeta(request),
    });
    return ok(result, { status: 201 });
  }
);
