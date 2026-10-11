/** GET /api/admin/quests/options — editör seçenekleri: işletme kategorileri (işletme sayısıyla) + matris ödül varsayılanı. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getQuestOptions } from '@/lib/admin-quests/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.quests.options', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getQuestOptions()));
