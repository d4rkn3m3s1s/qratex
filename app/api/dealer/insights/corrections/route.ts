/**
 * `POST /api/dealer/insights/corrections` — bir QR geri bildiriminin AI duygusunu düzelt.
 *
 * Yalnız DEALER; sahiplik DB'den; denetim izi `AIFeedbackCorrection` (öğrenme profili onu okur),
 * geri bildirimin duygusu da güncellenir. Alan serbest değil: yalnız `sentiment` ve 3 değer
 * (eski formdaki serbest alan adı + JSON değer → profil zehirleme yüzeyi kapandı).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { InsightMutationError, correctFeedbackSentiment } from '@/lib/dealer-insights/mutations';

export const dynamic = 'force-dynamic';

const Body = z.object({
  feedbackId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
});

export const POST = defineRoute(
  {
    name: 'dealer.insights.corrections',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'ai_features',
    rateLimit: 'mutation',
    schema: Body,
  },
  async ({ tenant, user, body }) => {
    try {
      return ok(
        await correctFeedbackSentiment({
          dealerId: tenant.dealerId,
          actorId: user.id,
          feedbackId: body.feedbackId,
          sentiment: body.sentiment,
        })
      );
    } catch (error) {
      if (error instanceof InsightMutationError) throw new ApiError(error.code, error.message);
      throw error;
    }
  }
);
