/**
 * PATCH — bekleyen meydan okumaya yanıt (yalnız rakip klanın lideri).
 * Kabul: atomik pending→active, kadro aynı transaction'da donar, iki klanın tüm kadrosuna
 * bildirim. Ret: iadeli soft-cancel (`cancelSquadBattle`). Süresi dolmuş davet kabul edilemez.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { respondChallenge } from '@/lib/squads/battles';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  {
    name: 'customer.squads.battle.respond',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
    params: z.object({ id: z.string().min(1).max(64) }),
    schema: z.object({ action: z.enum(['accept', 'reject']) }),
  },
  async ({ user, params, body }) => ok(await respondChallenge(user.id, params.id, body.action), { legacySpread: true })
);
