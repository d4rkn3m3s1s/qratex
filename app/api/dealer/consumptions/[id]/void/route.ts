import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { voidConsumption } from '@/lib/dealer/kasa/server';
import { mapKasaErrors } from '@/lib/dealer/kasa/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dealer/consumptions/[id]/void — hatalı kaydı geri al (`{ reason }`).
 *
 * Yalnız ilk 15 dk ve müşteri değerlendirmeden önce. Pasif puan `debitPoints` ile ters kayıt,
 * klan toplamı düşülür, kart denetimine tam anlık görüntü (`CONSUMPTION_VOIDED`), müşteriye
 * bildirim — tek transaction. Personel yalnız kendi girdiğini geri alır.
 */
export const POST = defineRoute(
  {
    name: 'dealer.consumptions.void',
    roles: ['DEALER', 'STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER', 'STAFF'] },
    params: z.object({ id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) }),
    schema: z.object({
      reason: z.string().trim().min(3, 'Gerekçe en az 3 karakter olmalı').max(200, 'Gerekçe en fazla 200 karakter olabilir'),
    }),
    rateLimit: 'mutation',
  },
  async ({ params, body, tenant, user, request }) =>
    ok(
      await mapKasaErrors(() =>
        voidConsumption({
          dealerId: tenant.dealerId,
          actorId: user.id,
          actorRole: user.role,
          consumptionId: params.id,
          reason: body.reason,
          ...getAuditRequestMeta(request),
        })
      )
    )
);
