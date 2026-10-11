/** GET /api/admin/ai-ops/signals/feedbacks?signal=…&value=… — sinyalden geri bildirim listesine iniş (sayfalı, kısa metin). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { signalFeedbacksQuerySchema } from '@/lib/admin-ai-ops/contract';
import { getSignalFeedbacks } from '@/lib/admin-ai-ops/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.ai_ops.signals.feedbacks', roles: ['ADMIN'], query: signalFeedbacksQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await getSignalFeedbacks(prisma, query))
);
