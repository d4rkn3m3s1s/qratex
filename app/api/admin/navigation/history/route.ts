/** GET /api/admin/navigation/history — navigasyon sürüm geçmişi (sayfalı, insan okunur fark). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { navHistoryQuerySchema } from '@/lib/admin-navigation/contract';
import { listNavigationHistory } from '@/lib/admin-navigation/navigation.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.navigation.history', roles: ['ADMIN'], query: navHistoryQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listNavigationHistory({ cursor: query.cursor, limit: query.limit }))
);
