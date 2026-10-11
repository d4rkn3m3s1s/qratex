/**
 * POST /api/admin/squads/[id]/actions — gerekçeli, denetimli klan moderasyonu:
 * freeze | unfreeze | rename | clear_description | regenerate_invite | remove_member | transfer_owner.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { squadActionSchema, squadIdParamsSchema } from '@/lib/admin-squads/contract';
import { applySquadAction } from '@/lib/admin-squads/actions.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.squads.action', roles: ['ADMIN'], params: squadIdParamsSchema, schema: squadActionSchema, rateLimit: 'mutation' },
  async ({ params, body, user, request }) => ok(await applySquadAction(params.id, body, { userId: user.id, ...getAuditRequestMeta(request) }))
);
