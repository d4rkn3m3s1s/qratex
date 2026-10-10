/**
 * GET /api/dealer/campaigns/:id/preview?holdout=0|10|20 — gönderim ÖNCESİ etki önizlemesi.
 * Gönderimle AYNI plan hesabı (kitle, izin, frekans tavanı, 1000 sınırı, kontrol grubu);
 * hiçbir şey yazmaz. Onay penceresi "kime, kaç kişiye" sorusunu bununla cevaplar.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { HOLDOUT_OPTIONS, isHoldoutPct, normalizeSegment } from '@/components/dealer/b-kampanyalar/domain';
import { buildSendPlan, toSendPreview } from '@/components/dealer/b-kampanyalar/server/audience';
import { assertCampaignsAvailable, loadOwnedCampaign } from '@/components/dealer/b-kampanyalar/server/common';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });
const query = z.object({
  holdout: z.coerce
    .number()
    .int()
    .refine((v) => (HOLDOUT_OPTIONS as readonly number[]).includes(v))
    .catch(0),
  dealerId: z.string().optional(),
});

export const GET = defineRoute(
  {
    name: 'dealer.campaigns.preview',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: { max: 60, windowMs: 60_000, by: 'user' },
    params,
    query,
  },
  async ({ params: p, query: q, tenant, user, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    const campaign = await loadOwnedCampaign(tenant.dealerId, p.id);
    const segment = normalizeSegment(campaign.targetSegment);
    const holdout = isHoldoutPct(q.holdout) ? q.holdout : 0;
    if (!segment) return ok(toSendPreview(null, holdout, null));
    const { plan } = await buildSendPlan({ dealerId: tenant.dealerId, campaignId: campaign.id, segment, holdoutPct: holdout });
    return ok(toSendPreview(segment, holdout, plan));
  }
);
