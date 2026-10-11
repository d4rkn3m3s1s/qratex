/** GET /api/admin/ai-ops/usage?period=7d — AI çağrı/hata/gecikme/token (kalıcı AIUsageLog; LLM yok). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { DEFAULT_AI_OPS_PERIOD, periodSchema } from '@/lib/admin-ai-ops/contract';
import { getUsageReport } from '@/lib/admin-ai-ops/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.ai_ops.usage',
    roles: ['ADMIN'],
    query: z.object({ period: periodSchema.default(DEFAULT_AI_OPS_PERIOD), fresh: z.enum(['1']).optional().catch(undefined) }),
    rateLimit: 'read',
  },
  async ({ query }) => ok(await getUsageReport(prisma, query.period, { fresh: query.fresh === '1' }))
);
