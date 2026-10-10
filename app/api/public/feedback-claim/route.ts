/**
 * POST /api/public/feedback-claim — oturumsuz gönderilen QR geri bildirimini hesaba bağla.
 * Yalnız CUSTOMER; belirteç gönderen cihazda tutulur (24 saat). Tek-kez garanti DB'de
 * (bkz. lib/feedback-funnel/claim.ts). İdempotent: aynı anahtarla tekrar çift kredi üretmez.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { claimFeedbackSchema } from '@/lib/feedback-funnel/schema';
import { claimFeedback } from '@/lib/feedback-funnel/claim';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'public.feedback.claim',
    roles: ['CUSTOMER'],
    schema: claimFeedbackSchema,
    rateLimit: { max: 10, windowMs: 10 * 60_000, by: 'user' },
    idempotent: true,
    maxBodyBytes: 4 * 1024,
  },
  async ({ body, user }) => ok(await claimFeedback(user.id, body.token))
);
