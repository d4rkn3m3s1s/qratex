/** POST /api/admin/users/[id]/elevation — bekleyen ADMIN yükseltmesini onayla (dört göz) ya da reddet. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { elevationDecisionSchema, idParamsSchema } from '@/lib/admin-users/contract';
import { actionCtx, decideElevation } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.users.elevation',
    roles: ['ADMIN'],
    params: idParamsSchema,
    schema: elevationDecisionSchema,
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
  },
  async ({ params, body, session, request }) => ok(await decideElevation(actionCtx(session, request), params.id, body))
);
