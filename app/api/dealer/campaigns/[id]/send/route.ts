/**
 * POST /api/dealer/campaigns/:id/send — kampanyayı ŞİMDİ gönderir.
 *
 * Kitle → izin (müşterinin "Kampanya & Sürprizler" tercihi, kanal bazlı, fail-closed) →
 * frekans tavanı (7 günde 2) → en fazla 1000 alıcı → isteğe bağlı kontrol grubu. Durum kilidi,
 * uygulama içi bildirimler ve alıcı kaydı tek transaction'da (bkz. server/delivery.ts).
 * Bayi başına günlük gönderim tavanı: 10.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { HOLDOUT_OPTIONS } from '@/components/dealer/b-kampanyalar/domain';
import { assertCampaignsAvailable, rethrowCampaignError } from '@/components/dealer/b-kampanyalar/server/common';
import { deliverCampaign } from '@/components/dealer/b-kampanyalar/server/delivery';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const params = z.object({ id: z.string().min(1).max(64) });
const body = z
  .object({
    holdoutPct: z
      .number()
      .int()
      .refine((v) => (HOLDOUT_OPTIONS as readonly number[]).includes(v), { message: 'Geçersiz kontrol grubu oranı' })
      .default(0),
  })
  .default({ holdoutPct: 0 });

export const POST = defineRoute(
  {
    name: 'dealer.campaigns.send',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: { max: 10, windowMs: 24 * 60 * 60_000, by: 'user' },
    params,
    schema: body,
    idempotent: true,
  },
  async ({ params: p, body: b, tenant, user, session, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    try {
      const result = await deliverCampaign({
        dealerId: tenant.dealerId,
        campaignId: p.id,
        holdoutPct: b.holdoutPct,
        trigger: 'manual',
        actor: {
          type: 'user',
          userId: user.id,
          snapshot: { email: session.user.email ?? null, role: user.role, name: session.user.name ?? null },
        },
      });
      return ok(result);
    } catch (err) {
      rethrowCampaignError(err);
    }
  }
);
