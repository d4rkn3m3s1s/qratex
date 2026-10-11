/** GET /api/admin/users/stats — rol/durum KPI'ları (tüm veri üzerinden; sayfaya özel değil). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getUsersStats } from '@/lib/admin-users/list.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.users.stats', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getUsersStats()));
