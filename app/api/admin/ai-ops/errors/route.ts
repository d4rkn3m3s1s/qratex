/** GET /api/admin/ai-ops/errors — başarısız AI çağrıları (sayfalı, en yeni önce). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { errorsQuerySchema } from '@/lib/admin-ai-ops/contract';
import { getErrors } from '@/lib/admin-ai-ops/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.ai_ops.errors', roles: ['ADMIN'], query: errorsQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await getErrors(prisma, query))
);
