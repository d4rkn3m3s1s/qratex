/** GET /api/admin/squads/stats — Klan Merkezi KPI'ları (klan + savaş ekonomisi). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getSquadStats } from '@/lib/admin-squads/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.squads.stats', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getSquadStats()));
