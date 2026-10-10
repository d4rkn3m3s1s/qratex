/**
 * GET /api/dealer/campaigns/audience — editördeki kitle kartları: her segmentin büyüklüğü ve
 * kampanya bildirimlerine izin veren kısmı (bayi-yerel segment kuralı, tek kaynak).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { audienceOverview } from '@/components/dealer/b-kampanyalar/server/audience';
import { assertCampaignsAvailable } from '@/components/dealer/b-kampanyalar/server/common';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.campaigns.audience',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: { max: 60, windowMs: 60_000, by: 'user' },
  },
  async ({ tenant, user, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    return ok(await audienceOverview(tenant.dealerId));
  }
);
