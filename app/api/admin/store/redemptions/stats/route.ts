/** GET /api/admin/store/redemptions/stats — bekleyen / bekleyen fiziksel / 30 gün teslim / 30 gün iptal. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getRedemptionStats } from '@/lib/admin-store/redemptions.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.store.redemptions.stats', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getRedemptionStats()));
