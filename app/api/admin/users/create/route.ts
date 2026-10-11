/** POST /api/admin/users/create — davetle (varsayılan) ya da şifreyle kullanıcı oluşturma. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { createUserSchema } from '@/lib/admin-users/contract';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { createUserByAdmin } from '@/lib/admin-users/account.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.users.create', roles: ['ADMIN'], schema: createUserSchema, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await createUserByAdmin(actionCtx(session, request), body), { status: 201 })
);
