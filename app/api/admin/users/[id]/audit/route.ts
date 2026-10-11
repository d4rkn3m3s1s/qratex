/** GET /api/admin/users/[id]/audit — kullanıcı üzerinde ve kullanıcının yaptığı denetim kayıtları. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema, pageQuerySchema } from '@/lib/admin-users/contract';
import { getUserAudit } from '@/lib/admin-users/detail.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.users.audit', roles: ['ADMIN'], params: idParamsSchema, query: pageQuerySchema, rateLimit: 'read' },
  async ({ params, query }) => ok(await getUserAudit(params.id, query.page, query.size))
);
