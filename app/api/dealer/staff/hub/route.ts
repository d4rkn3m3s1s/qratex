import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getTeamHub } from '@/lib/staff-ops/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/staff/hub?week=YYYY-MM-DD — /dealer/team ekip merkezinin tek BFF'i:
 * bugün özeti (KPI), ekip + davetler, görevler, seçili haftanın vardiya/puantajı, izin kuyruğu,
 * eğitim tamamlanma matrisi, kontrol listesi uyumu (7 gün), saha bildirimleri.
 */
export const GET = defineRoute(
  {
    name: 'dealer.team.hub',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    query: z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    rateLimit: 'read',
  },
  async ({ tenant, query }) => ok(await getTeamHub(tenant.dealerId, { week: query.week ?? null }))
);
