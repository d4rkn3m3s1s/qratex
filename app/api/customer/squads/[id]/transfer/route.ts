/**
 * POST — liderliği bir üyeye devret (yalnız lider). Hedef başka klanın lideriyse 409.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { transferOwnership } from '@/lib/squads/membership';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'customer.squads.transfer',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    params: z.object({ id: z.string().min(1).max(64) }),
    schema: z.object({ userId: z.string().min(1).max(64) }),
  },
  async ({ user, params, body }) => {
    const r = await transferOwnership(user.id, params.id, body.userId);
    return ok({ ...r, message: `Liderlik ${r.name} adlı üyeye devredildi.` }, { legacySpread: true });
  }
);
