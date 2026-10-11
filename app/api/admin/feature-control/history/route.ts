/** GET /api/admin/feature-control/history — modül, kademeli açılış ve deney değişiklik geçmişi (sayfalı). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { HistoryQuery } from '@/lib/admin-flags/contract';
import { listHistory } from '@/lib/admin-flags/modules.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.featureControl.history', roles: ['ADMIN'], query: HistoryQuery, rateLimit: 'read' },
  async ({ query }) => ok(await listHistory(query))
);
