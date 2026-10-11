/** GET /api/admin/users/[id]/ledger — puan defteri (sayfalı) + son 30 gün özeti. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema, pageQuerySchema } from '@/lib/admin-users/contract';
import { getLedger } from '@/lib/admin-users/detail.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.users.ledger', roles: ['ADMIN'], params: idParamsSchema, query: pageQuerySchema, rateLimit: 'read' },
  async ({ params, query }) => ok(await getLedger(params.id, query.page, query.size))
);
