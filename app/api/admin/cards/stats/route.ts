/** GET /api/admin/cards/stats — kart KPI şeridi (tüm veriden; filtreden bağımsız). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getCardStats } from '@/lib/admin-cards/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.cards.stats', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getCardStats()));
