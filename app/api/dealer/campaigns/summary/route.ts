/**
 * GET /api/dealer/campaigns/summary — son 30 günün özet şeridi (gönderilen kampanya, ulaşılan
 * müşteri, uygulama içi açılma oranı, planlı/taslak sayısı). Veri yoksa oran `null` ("—").
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { assertCampaignsAvailable } from '@/components/dealer/b-kampanyalar/server/common';
import { campaignSummary } from '@/components/dealer/b-kampanyalar/server/list';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.campaigns.summary', roles: ['DEALER', 'ADMIN'], tenant: 'dealer', rateLimit: 'read' },
  async ({ tenant, user, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    return ok(await campaignSummary(tenant.dealerId));
  }
);
