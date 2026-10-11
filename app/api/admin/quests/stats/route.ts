/** GET /api/admin/quests/stats — KPI şeridi (durum sayıları, defterden basılan görev puanı, modül durumu). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getQuestStats } from '@/lib/admin-quests/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.quests.stats', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getQuestStats()));
