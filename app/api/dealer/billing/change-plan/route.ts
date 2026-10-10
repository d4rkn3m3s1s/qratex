export const dynamic = 'force-dynamic';

/**
 * POST /api/dealer/billing/change-plan — aktif aboneliği yeni plana taşır (P0-29).
 *
 * Eskiden plan değişikliği yeni bir Checkout açıyordu → ikinci abonelik → çift ücret.
 * Artık mevcut abonelik `stripe.subscriptions.update` ile güncellenir; prorasyon hemen
 * faturalanır ve ödeme alınamazsa değişiklik uygulanmaz. `prorationDate` önizlemeden
 * gelir (önizlenen tutar = tahsil edilen tutar; tekrar istekler tek işleme iner).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { changeSubscriptionPlan } from '@/lib/billing-core';
import { billingErrorToApiError } from '../billing-errors';

const bodySchema = z.object({
  planId: z.string().min(1).max(64),
  prorationDate: z.number().int().positive().optional(),
});

export const POST = defineRoute(
  {
    name: 'dealer.billing.change-plan',
    roles: ['DEALER'],
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    schema: bodySchema,
  },
  async ({ body, user }) => {
    const result = await changeSubscriptionPlan(user.id, body.planId, { prorationDate: body.prorationDate });
    if (!result.ok) throw billingErrorToApiError(result.code, result.error);
    return ok({ planId: result.planId, status: result.status });
  }
);
