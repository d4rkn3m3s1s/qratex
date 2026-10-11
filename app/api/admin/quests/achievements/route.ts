/** POST /api/admin/quests/achievements — eksik sistem başarımlarını duraklatılmış olarak ekler (var olanlara dokunmaz). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { addMissingAchievements } from '@/lib/admin-quests/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.quests.achievements', roles: ['ADMIN'], rateLimit: 'mutation' },
  async ({ user, request }) => ok(await addMissingAchievements({ userId: user.id, ...getAuditRequestMeta(request) }))
);
