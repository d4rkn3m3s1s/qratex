/** GET /api/admin/observability?window=2h|24h — sağlık, uç metrikleri, Web Vitals, Vercel, işler, sorunlar. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { obsWindowSchema } from '@/lib/observability/contract';
import { loadObservability } from '@/lib/observability/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.observability.snapshot',
    roles: ['ADMIN'],
    query: z.object({ window: obsWindowSchema.catch('24h'), fresh: z.enum(['1']).optional().catch(undefined) }),
    rateLimit: 'read',
  },
  async ({ query }) => ok(await loadObservability(query.window, { fresh: query.fresh === '1' }))
);
