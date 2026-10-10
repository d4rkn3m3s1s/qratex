/**
 * POST /api/dealer/qr-codes/[id]/lifecycle — iptal / iptali geri al / arşivle / arşivden al / yenile.
 * Silme yok (C1). Kota kuralları: lib/dealer/qr-codes/actions.server.ts (D5).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { qrLifecycle } from '@/lib/dealer/qr-codes/actions.server';
import { qrLifecycleSchema } from '@/lib/dealer/qr-codes/rules';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.qr-codes.lifecycle',
    roles: ['DEALER'],
    tenant: 'dealer',
    params: z.object({ id: z.string().min(1).max(64) }),
    schema: qrLifecycleSchema,
    rateLimit: 'mutation',
    maxBodyBytes: 1024,
  },
  async ({ tenant, params: p, body }) =>
    ok(await qrLifecycle({ dealerId: tenant.dealerId, actorId: tenant.actorId }, p.id, body.action))
);
