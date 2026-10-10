/**
 * POST   /api/dealer/campaigns/:id/schedule — { day: 'YYYY-MM-DD', holdoutPct } ile planlar.
 *        Gün hassasiyeti: kampanya seçilen günün sabahki günlük gönderim turunda (06:00 İstanbul
 *        civarı) çıkar (tek uyanış kuralı, bkz. server/schedule.ts).
 * DELETE /api/dealer/campaigns/:id/schedule — planı iptal eder (taslağa döner).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { HOLDOUT_OPTIONS } from '@/components/dealer/b-kampanyalar/domain';
import { assertCampaignsAvailable, rethrowCampaignError } from '@/components/dealer/b-kampanyalar/server/common';
import { cancelSchedule, scheduleCampaign } from '@/components/dealer/b-kampanyalar/server/schedule';
import type { DeliveryActor } from '@/components/dealer/b-kampanyalar/server/delivery';
import type { Session } from 'next-auth';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });
const body = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçerli bir gün seçin'),
  holdoutPct: z
    .number()
    .int()
    .refine((v) => (HOLDOUT_OPTIONS as readonly number[]).includes(v), { message: 'Geçersiz kontrol grubu oranı' })
    .default(0),
});

function actorOf(user: { id: string; role: string }, session: Session): DeliveryActor {
  return { type: 'user', userId: user.id, snapshot: { email: session.user.email ?? null, role: user.role, name: session.user.name ?? null } };
}

export const POST = defineRoute(
  {
    name: 'dealer.campaigns.schedule',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    params,
    schema: body,
  },
  async ({ params: p, body: b, tenant, user, session, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    try {
      return ok(
        await scheduleCampaign({
          dealerId: tenant.dealerId,
          campaignId: p.id,
          day: b.day,
          holdoutPct: b.holdoutPct,
          actor: actorOf(user, session),
        })
      );
    } catch (err) {
      rethrowCampaignError(err);
    }
  }
);

export const DELETE = defineRoute(
  { name: 'dealer.campaigns.unschedule', roles: ['DEALER', 'ADMIN'], tenant: 'dealer', rateLimit: 'mutation', params },
  async ({ params: p, tenant, user, session, request }) => {
    await assertCampaignsAvailable({ userId: user.id, request });
    try {
      await cancelSchedule({ dealerId: tenant.dealerId, campaignId: p.id, actor: actorOf(user, session) });
      return ok({ cancelled: true });
    } catch (err) {
      rethrowCampaignError(err);
    }
  }
);
