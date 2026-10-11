/**
 * POST /api/admin/users/[id]/role — rol değişikliği. ADMIN'e yükseltme talep olarak kaydedilir
 * ve başka bir yöneticinin onayını bekler (`/elevation`). Kendine, son yöneticiye ve STAFF'a
 * doğrudan atama kapalı; değişiklik açık oturumları anında düşürür.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema, roleChangeSchema } from '@/lib/admin-users/contract';
import { actionCtx, changeRole } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.users.role',
    roles: ['ADMIN'],
    params: idParamsSchema,
    schema: roleChangeSchema,
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
  },
  async ({ params, body, session, request }) => ok(await changeRole(actionCtx(session, request), params.id, body))
);
