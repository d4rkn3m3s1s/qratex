/** GET /api/admin/design-system/theme/history — tema yayın/geri alma geçmişi (sayfalı, önce/sonra anlık görüntüsüyle). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { HistoryQuery } from '@/lib/design-system/theme-schemas';
import { listThemeHistory } from '@/lib/design-system/theme.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.designSystem.theme.history', roles: ['ADMIN'], query: HistoryQuery, rateLimit: 'read' },
  async ({ query }) => ok(await listThemeHistory(query))
);
