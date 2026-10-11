/**
 * POST /api/dealer/automation/remedy/scan — son 14 günü tara. `dryRun: true` hiçbir şey yazmaz
 * (aday / anonim / teklifi var / bekleme süresinde sınıflaması); `false` kuyruğa ekler.
 * Bayi başına dakikada en fazla 4 çağrı.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { scanRemedy } from '@/lib/dealer-automation/remedy.server';
import { remedyScanSchema } from '@/lib/dealer-automation/remedy-config';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.automation.remedy.scan',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'remedy_offers',
    schema: remedyScanSchema,
    rateLimit: { max: 4, windowMs: 60_000, by: 'user-or-ip' },
    maxBodyBytes: 512,
  },
  async ({ tenant, body }) => ok(await scanRemedy({ dealerId: tenant.dealerId, actorId: tenant.actorId }, body.dryRun))
);
