import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { happyHourPatchSchema } from '@/lib/dealer/offers/rules';
import { setDealerHappyHourActive } from '@/lib/dealer/offers/mutations.server';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/dealer/offers/happy-hours/[id] — `{ isActive }`: mutlu saati duraklatır ya da
 * yeniden açar. Yalnız işletmenin kendi kaydı (platform geneli kayıtlar eşleşmez). Silme yok.
 */
export const PATCH = defineRoute(
  {
    name: 'dealer.offers.happy-hours.toggle',
    roles: ['DEALER'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER'] },
    params: z.object({ id: z.string().trim().min(1).max(64) }),
    schema: happyHourPatchSchema,
    rateLimit: 'mutation',
  },
  async ({ params, body, tenant, user, request }) =>
    ok(
      await setDealerHappyHourActive({
        dealerId: tenant.dealerId,
        actorId: user.id,
        happyHourId: params.id,
        isActive: body.isActive,
        audit: getAuditRequestMeta(request),
      })
    )
);
