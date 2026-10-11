/** GET /api/admin/economy/history?kind=matrix|multipliers|leagues&page= — ayar değişiklik geçmişi (AuditLog). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { historyQuerySchema } from '@/lib/admin-economy/contract';
import { listHistory } from '@/lib/admin-economy/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.economy.history', roles: ['ADMIN'], query: historyQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listHistory(query.kind, query.page, query.size))
);
