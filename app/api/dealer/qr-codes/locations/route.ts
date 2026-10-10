/**
 * GET  /api/dealer/qr-codes/locations — şubeler (canlı QR sayısı, 30 gün yorum, şube kotası).
 * POST /api/dealer/qr-codes/locations — yeni şube (plan `maxBranches` kotası, kilit altında).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadLocations } from '@/lib/dealer/qr-codes/load.server';
import { createLocation } from '@/lib/dealer/qr-codes/actions.server';
import { locationCreateSchema } from '@/lib/dealer/qr-codes/rules';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.qr-codes.locations', roles: ['DEALER'], tenant: 'dealer', rateLimit: 'read' },
  async ({ tenant }) => ok(await loadLocations(tenant.dealerId))
);

export const POST = defineRoute(
  {
    name: 'dealer.qr-codes.locations.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    schema: locationCreateSchema,
    rateLimit: 'mutation',
    idempotent: true,
    maxBodyBytes: 4 * 1024,
  },
  async ({ tenant, body }) =>
    ok(await createLocation({ dealerId: tenant.dealerId, actorId: tenant.actorId }, body), { status: 201 })
);
