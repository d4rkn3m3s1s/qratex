/** POST /api/admin/users/[id]/notify — uygulama içi doğrudan bildirim (uzunluk sınırlı, denetimli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema, notifySchema } from '@/lib/admin-users/contract';
import { actionCtx, sendDirectNotification } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.users.notify',
    roles: ['ADMIN'],
    params: idParamsSchema,
    schema: notifySchema,
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
    idempotent: true,
  },
  async ({ params, body, session, request }) =>
    ok(await sendDirectNotification(actionCtx(session, request), params.id, body), { status: 201 })
);
