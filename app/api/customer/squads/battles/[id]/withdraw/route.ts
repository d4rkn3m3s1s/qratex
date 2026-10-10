/**
 * POST — bekleyen meydan okumayı geri çek (gönderen klanın lideri). Escrow atomik ve tek
 * sefer iade edilir; savaş satırı silinmez (soft-cancel + AuditLog). Önceden puan, süre
 * dolana kadar kilitli kalıyordu (customer_squads.md envanter 20).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { withdrawChallenge } from '@/lib/squads/battles';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'customer.squads.battle.withdraw',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    params: z.object({ id: z.string().min(1).max(64) }),
  },
  async ({ user, params }) => ok(await withdrawChallenge(user.id, params.id), { legacySpread: true })
);
