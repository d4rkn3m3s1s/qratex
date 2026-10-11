/** POST /api/admin/users/[id]/sessions — kullanıcının tüm oturumlarını sonlandır (`sessionVersion`). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema } from '@/lib/admin-users/contract';
import { actionCtx, revokeSessions } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.users.sessions', roles: ['ADMIN'], params: idParamsSchema, rateLimit: { max: 10, windowMs: 60_000, by: 'user' } },
  async ({ params, session, request }) => ok(await revokeSessions(actionCtx(session, request), params.id))
);
