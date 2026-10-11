/** /api/admin/users/[id]/rewards — kullanıcının ödülleri (GET) ve hediye ödül (POST; stok/aktiflik denetimli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { grantRewardSchema, idParamsSchema, pageQuerySchema } from '@/lib/admin-users/contract';
import { getUserRewards } from '@/lib/admin-users/detail.server';
import { actionCtx, grantReward } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.users.rewards', roles: ['ADMIN'], params: idParamsSchema, query: pageQuerySchema, rateLimit: 'read' },
  async ({ params, query }) => ok(await getUserRewards(params.id, query.page, query.size))
);

export const POST = defineRoute(
  {
    name: 'admin.users.rewards.grant',
    roles: ['ADMIN'],
    params: idParamsSchema,
    schema: grantRewardSchema,
    rateLimit: 'mutation',
    idempotent: true,
  },
  async ({ params, body, session, request }) => ok(await grantReward(actionCtx(session, request), params.id, body), { status: 201 })
);
