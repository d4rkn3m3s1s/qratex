/**
 * POST /api/dealer/campaigns/:id/duplicate — kampanyayı yeni bir TASLAK olarak çoğaltır
 * (gönderilmiş kampanyayı yeniden kullanmanın tek yolu; gönderim kaydı değişmez).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { assertCampaignsAvailable, toCampaignDto } from '@/components/dealer/b-kampanyalar/server/common';
import { duplicateCampaign } from '@/components/dealer/b-kampanyalar/server/crud';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  {
    name: 'dealer.campaigns.duplicate',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: { max: 30, windowMs: 60 * 60_000, by: 'user' },
    params,
    schema: z.object({ suffix: z.enum(['(kopya)', '(copy)']).default('(kopya)') }).default({ suffix: '(kopya)' }),
    idempotent: true,
  },
  async ({ params: p, body, tenant, user, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    const campaign = await duplicateCampaign(tenant.dealerId, p.id, body.suffix);
    return ok({ campaign: toCampaignDto(campaign) }, { status: 201 });
  }
);
