/**
 * GET /api/dealer/campaigns/:id/performance?window=7|14|30 — gerçek huni ve etki ölçümü
 * (bkz. components/dealer/b-kampanyalar/server/performance.ts). Eski başlık→UTM eşlemesi
 * kaldırıldı. Yabancı kampanya → 404 (eskiden 403 dönüp varlığı sızdırıyordu).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { parseWindow } from '@/components/dealer/b-kampanyalar/domain';
import { assertCampaignsAvailable } from '@/components/dealer/b-kampanyalar/server/common';
import { campaignPerformance } from '@/components/dealer/b-kampanyalar/server/performance';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });
const query = z.object({
  window: z.string().max(4).optional(),
  dealerId: z.string().optional(),
});

export const GET = defineRoute(
  {
    name: 'dealer.campaigns.performance',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
    params,
    query,
  },
  async ({ params: p, query: q, tenant, user, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    return ok(await campaignPerformance(tenant.dealerId, p.id, parseWindow(q.window)));
  }
);
