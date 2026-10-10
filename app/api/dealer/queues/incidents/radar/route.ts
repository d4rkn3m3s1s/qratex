import { defineRoute, ok } from '@/lib/http/define-route';
import { getRadarStatus, runIncidentRadarForDealer } from '@/lib/dealer-queues/radar';

export const dynamic = 'force-dynamic';

/** Kriz radarı durumu (kural göstergeleri + düzey). Salt okuma; vaka ÜRETMEZ (60 sn önbellek). */
export const GET = defineRoute(
  {
    name: 'dealer.queues.radar.status',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'incidents',
    rateLimit: 'read',
  },
  async ({ tenant }) => ok(await getRadarStatus(tenant.dealerId))
);

/** "Şimdi tara": radarı hemen değerlendirir, eşik aşan kural için tekil vaka açar. */
export const POST = defineRoute(
  {
    name: 'dealer.queues.radar.scan',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'incidents',
    rateLimit: { max: 6, windowMs: 10 * 60_000, by: 'user' },
  },
  async ({ tenant }) => {
    const run = await runIncidentRadarForDealer(tenant.dealerId, { trigger: 'manual' });
    const status = await getRadarStatus(tenant.dealerId, { fresh: true });
    return ok({ created: run.created, skipped: run.skipped, status });
  }
);
