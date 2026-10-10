/**
 * `POST /api/dealer/insights/actions` — öneriyi aksiyon listesine ekle (atama + bitiş günü).
 *
 * Yalnız DEALER; idempotent (`Idempotency-Key`); aynı metin açık listede varsa yeni kayıt
 * açılmaz (`created: false` + mevcut kimlik). Atanan kişi bayinin kendisi ya da aktif personeli.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { InsightMutationError, createInsightAction } from '@/lib/dealer-insights/mutations';

export const dynamic = 'force-dynamic';

const Body = z.object({
  text: z.string().trim().min(3).max(500),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  assignedToId: z.string().max(191).nullable().optional(),
  dueDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  feedbackIds: z.array(z.string().max(64)).max(5).optional(),
});

export const POST = defineRoute(
  {
    name: 'dealer.insights.actions',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'ai_features',
    rateLimit: 'mutation',
    idempotent: true,
    schema: Body,
  },
  async ({ tenant, body }) => {
    try {
      const result = await createInsightAction({ dealerId: tenant.dealerId, ...body });
      return ok(result, { status: result.created ? 201 : 200 });
    } catch (error) {
      if (error instanceof InsightMutationError) throw new ApiError(error.code, error.message);
      throw error;
    }
  }
);
