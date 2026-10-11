/** GET /api/admin/badges/stats — Rozet sağlık sayıları (sekme bazında) + nadirlik dağılımı. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getBadgeStats } from '@/lib/admin-badges/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.badges.stats', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getBadgeStats()));
