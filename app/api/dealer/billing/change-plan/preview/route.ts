export const dynamic = 'force-dynamic';

/**
 * POST /api/dealer/billing/change-plan/preview — plan değişikliğinin parasal etkisini
 * (hemen tahsil edilecek prorasyon + sonraki dönem tutarı) Stripe fatura önizlemesiyle döner.
 * Yanıttaki `prorationDate`, uygulamada aynen geri gönderilir.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { previewPlanChange } from '@/lib/billing-core';
import { billingErrorToApiError } from '../../billing-errors';

const bodySchema = z.object({ planId: z.string().min(1).max(64) });

export const POST = defineRoute(
  {
    name: 'dealer.billing.change-plan.preview',
    roles: ['DEALER'],
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
    schema: bodySchema,
  },
  async ({ body, user }) => {
    const result = await previewPlanChange(user.id, body.planId);
    if (!result.ok) throw billingErrorToApiError(result.code, result.error);
    return ok(result.preview);
  }
);
