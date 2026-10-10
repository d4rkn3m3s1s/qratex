/**
 * GET  /api/dealer/campaigns — sekmeli, aranabilir, sayfalı kampanya listesi (+ sekme sayaçları).
 * POST /api/dealer/campaigns — taslak oluşturur.
 *
 * Varsayılan reddet: rol (DEALER; ADMIN yalnız `?dealerId=` ile salt-okunur), kiracı kapsamı,
 * zod, hız sınırı, bayi rolü için modül + menü kapısı (denetim Bulgu 6).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { CAMPAIGN_SEGMENT_KEYS, LIST_TABS } from '@/components/dealer/b-kampanyalar/domain';
import { assertCampaignsAvailable, toCampaignDto } from '@/components/dealer/b-kampanyalar/server/common';
import { createCampaign } from '@/components/dealer/b-kampanyalar/server/crud';
import { listCampaigns } from '@/components/dealer/b-kampanyalar/server/list';
import { campaignCreateSchema } from './campaign-schema';

export const dynamic = 'force-dynamic';

const listQuery = z.object({
  tab: z.enum(LIST_TABS).catch('drafts'),
  q: z.string().trim().max(100).optional(),
  segment: z.enum(CAMPAIGN_SEGMENT_KEYS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  dealerId: z.string().optional(),
});

export const GET = defineRoute(
  {
    name: 'dealer.campaigns.list',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
    query: listQuery,
  },
  async ({ query, tenant, user, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    return ok(
      await listCampaigns(tenant.dealerId, {
        tab: query.tab,
        q: query.q ?? null,
        segment: query.segment ?? null,
        page: query.page,
      })
    );
  }
);

export const POST = defineRoute(
  {
    name: 'dealer.campaigns.create',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: { max: 30, windowMs: 60 * 60_000, by: 'user' },
    schema: campaignCreateSchema,
    idempotent: true,
  },
  async ({ body, tenant, user, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    const campaign = await createCampaign(tenant.dealerId, {
      title: body.title,
      message: body.message,
      segment: body.targetSegment,
    });
    return ok({ campaign: toCampaignDto(campaign) }, { status: 201 });
  }
);
