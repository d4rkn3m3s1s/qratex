/** GET /api/admin/ai/studio/history — stüdyo denetim geçmişi (imleçli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { historyQuerySchema } from '@/lib/ai-studio/contract';
import { listStudioAudit } from '@/lib/ai-studio/overview.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.ai-studio.history', roles: ['ADMIN'], query: historyQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listStudioAudit(query))
);
