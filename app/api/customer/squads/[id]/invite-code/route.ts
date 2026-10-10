/**
 * POST — davet kodunu yenile (yalnız lider). Eski kod anında geçersiz olur.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { regenerateInviteCode } from '@/lib/squads/membership';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'customer.squads.invite-rotate',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: { max: 5, windowMs: 10 * 60_000, by: 'user' },
    params: z.object({ id: z.string().min(1).max(64) }),
  },
  async ({ user, params }) => ok(await regenerateInviteCode(user.id, params.id))
);
