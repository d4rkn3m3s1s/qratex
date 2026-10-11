/** GET /api/admin/surprise-box/stats — KPI'lar, kalan günlük bütçe, günlük kutu olasılık doğrulaması. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getStats } from '@/lib/admin-surprise-boxes/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.surpriseBox.stats', roles: ['ADMIN'], rateLimit: 'read' },
  async ({ user }) => ok(await getStats(user.id))
);
