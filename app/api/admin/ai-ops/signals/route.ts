/** GET /api/admin/ai-ops/signals?period=7d — müşteri sesi: kapsam, dikkat, dağılımlar, tema/varlık/aksiyon, riskli bayiler. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { DEFAULT_AI_OPS_PERIOD, periodSchema } from '@/lib/admin-ai-ops/contract';
import { getSignalsReport } from '@/lib/admin-ai-ops/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.ai_ops.signals',
    roles: ['ADMIN'],
    query: z.object({ period: periodSchema.default(DEFAULT_AI_OPS_PERIOD), fresh: z.enum(['1']).optional().catch(undefined) }),
    rateLimit: 'read',
  },
  async ({ query }) => ok(await getSignalsReport(prisma, query.period, { fresh: query.fresh === '1' }))
);
