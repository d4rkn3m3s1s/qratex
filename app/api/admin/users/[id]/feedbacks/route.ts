/** GET /api/admin/users/[id]/feedbacks — kullanıcının geri bildirimleri. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema, pageQuerySchema } from '@/lib/admin-users/contract';
import { getUserFeedbacks } from '@/lib/admin-users/detail.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.users.feedbacks', roles: ['ADMIN'], params: idParamsSchema, query: pageQuerySchema, rateLimit: 'read' },
  async ({ params, query }) => ok(await getUserFeedbacks(params.id, query.page, query.size))
);
