/** GET /api/admin/users/[id] — Kullanıcı 360 özeti. */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema } from '@/lib/admin-users/contract';
import { getUser360 } from '@/lib/admin-users/detail.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.users.detail', roles: ['ADMIN'], params: idParamsSchema, rateLimit: 'read' },
  async ({ params, user }) => {
    const data = await getUser360(params.id, user.id);
    if (!data) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');
    return ok(data);
  }
);
