/** GET /api/admin/ai-ops/backlog/pending?state=eligible|exhausted|blocked|stale — bekleyen kayıtlar (sayfalı). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { pendingQuerySchema } from '@/lib/admin-ai-ops/contract';
import { getPendingPage } from '@/lib/admin-ai-ops/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.ai_ops.backlog.pending', roles: ['ADMIN'], query: pendingQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await getPendingPage(prisma, query))
);
