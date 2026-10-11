/**
 * /api/admin/quests/[id]
 *  GET   → ayrıntı (metrik, son tamamlayanlar, 14 günlük ödeme serisi, denetim geçmişi).
 *  PATCH → kısmi düzenleme; `baseUpdatedAt` uyuşmazsa 409 (iyimser eşzamanlılık).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { questIdParamsSchema, questUpdateSchema } from '@/lib/admin-quests/contract';
import { getQuestDetail, updateQuest } from '@/lib/admin-quests/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.quests.detail', roles: ['ADMIN'], params: questIdParamsSchema, rateLimit: 'read' },
  async ({ params }) => ok(await getQuestDetail(params.id))
);

export const PATCH = defineRoute(
  { name: 'admin.quests.update', roles: ['ADMIN'], params: questIdParamsSchema, schema: questUpdateSchema, rateLimit: 'mutation' },
  async ({ params, body, user, request }) => ok(await updateQuest(params.id, body, { userId: user.id, ...getAuditRequestMeta(request) }))
);
