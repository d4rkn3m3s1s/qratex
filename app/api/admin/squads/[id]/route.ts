/** GET /api/admin/squads/[id] — klan detayı (üyeler, sicil, son 20 savaş, moderasyon geçmişi). */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { squadIdParamsSchema } from '@/lib/admin-squads/contract';
import { getSquadDetail } from '@/lib/admin-squads/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.squads.detail', roles: ['ADMIN'], params: squadIdParamsSchema, rateLimit: 'read' },
  async ({ params }) => {
    const data = await getSquadDetail(params.id);
    if (!data) throw new ApiError('NOT_FOUND', 'Klan bulunamadı.');
    return ok(data);
  }
);
