/** GET /api/admin/store/rewards/stats — Ödül KPI şeridi (yayında/taslak/tükenen/az kalan/bekleyen/30 gün harcanan puan). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getRewardStats } from '@/lib/admin-store/rewards.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.store.rewards.stats', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getRewardStats()));
