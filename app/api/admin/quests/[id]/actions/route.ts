/**
 * POST /api/admin/quests/[id]/actions — adlandırılmış durum geçişleri (koşullu yazım, denetimli):
 * pause | resume | archive (gerekçeli) | restore | duplicate | manual_complete (yönetici onaylı görev).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { questActionSchema, questIdParamsSchema } from '@/lib/admin-quests/contract';
import { applyQuestAction } from '@/lib/admin-quests/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.quests.action', roles: ['ADMIN'], params: questIdParamsSchema, schema: questActionSchema, rateLimit: 'mutation', idempotent: true },
  async ({ params, body, user, request }) => ok(await applyQuestAction(params.id, body, { userId: user.id, ...getAuditRequestMeta(request) }))
);
