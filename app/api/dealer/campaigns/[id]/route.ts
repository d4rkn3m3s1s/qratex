/**
 * GET    /api/dealer/campaigns/:id — tek kampanya (editör).
 * PATCH  /api/dealer/campaigns/:id — taslak/planlı/başarısız kampanyayı düzenler.
 * DELETE /api/dealer/campaigns/:id — yalnız hiç gönderilmemiş kampanya silinir; gönderilmiş
 *        kampanya arşivlenir (`/archive`). Yabancı kampanya → 404.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import {
  assertCampaignsAvailable,
  loadOwnedCampaign,
  rethrowCampaignError,
  toCampaignDto,
} from '@/components/dealer/b-kampanyalar/server/common';
import { deleteCampaign, updateCampaign } from '@/components/dealer/b-kampanyalar/server/crud';
import { campaignUpdateSchema } from '../campaign-schema';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'dealer.campaigns.get', roles: ['DEALER', 'ADMIN'], tenant: 'dealer', rateLimit: 'read', params },
  async ({ params: p, tenant, user, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    return ok({ campaign: toCampaignDto(await loadOwnedCampaign(tenant.dealerId, p.id)) });
  }
);

export const PATCH = defineRoute(
  {
    name: 'dealer.campaigns.update',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    params,
    schema: campaignUpdateSchema,
  },
  async ({ params: p, body, tenant, user, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    try {
      const campaign = await updateCampaign(tenant.dealerId, p.id, {
        title: body.title,
        message: body.message,
        segment: body.targetSegment,
      });
      return ok({ campaign: toCampaignDto(campaign) });
    } catch (err) {
      rethrowCampaignError(err);
    }
  }
);

export const DELETE = defineRoute(
  { name: 'dealer.campaigns.delete', roles: ['DEALER', 'ADMIN'], tenant: 'dealer', rateLimit: 'mutation', params },
  async ({ params: p, tenant, user, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    try {
      await deleteCampaign(tenant.dealerId, p.id);
      return ok({ deleted: true });
    } catch (err) {
      rethrowCampaignError(err);
    }
  }
);
