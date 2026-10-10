/**
 * POST /api/dealer/campaigns/:id/archive — { archived: boolean }. Gönderilmiş kampanya silinmez,
 * arşive alınır (alıcı kaydı ve performans korunur); arşivden geri çıkarılabilir.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { assertCampaignsAvailable, rethrowCampaignError, toCampaignDto } from '@/components/dealer/b-kampanyalar/server/common';
import { setArchived } from '@/components/dealer/b-kampanyalar/server/crud';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  {
    name: 'dealer.campaigns.archive',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    params,
    schema: z.object({ archived: z.boolean() }),
  },
  async ({ params: p, body, tenant, user, session, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    try {
      const campaign = await setArchived({
        dealerId: tenant.dealerId,
        id: p.id,
        archived: body.archived,
        actor: { type: 'user', userId: user.id, snapshot: { email: session.user.email ?? null, role: user.role, name: session.user.name ?? null } },
      });
      return ok({ campaign: toCampaignDto(campaign) });
    } catch (err) {
      rethrowCampaignError(err);
    }
  }
);
