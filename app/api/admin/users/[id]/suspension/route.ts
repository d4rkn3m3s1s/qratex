/** POST /api/admin/users/[id]/suspension — askıya al / askıdan çıkar (silme yerine; geri alınabilir). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema, suspensionSchema } from '@/lib/admin-users/contract';
import { actionCtx, setSuspension } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.users.suspension', roles: ['ADMIN'], params: idParamsSchema, schema: suspensionSchema, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await setSuspension(actionCtx(session, request), params.id, body))
);
