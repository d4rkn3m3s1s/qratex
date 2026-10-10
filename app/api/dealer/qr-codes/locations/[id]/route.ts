/** PATCH /api/dealer/qr-codes/locations/[id] — ad/adres düzenle ya da arşivle/geri al (silme yok, C1). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { updateLocation } from '@/lib/dealer/qr-codes/actions.server';
import { locationUpdateSchema } from '@/lib/dealer/qr-codes/rules';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  {
    name: 'dealer.qr-codes.locations.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    params: z.object({ id: z.string().min(1).max(64) }),
    schema: locationUpdateSchema,
    rateLimit: 'mutation',
    maxBodyBytes: 4 * 1024,
  },
  async ({ tenant, params: p, body }) =>
    ok(await updateLocation({ dealerId: tenant.dealerId, actorId: tenant.actorId }, p.id, body))
);
