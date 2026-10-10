/**
 * GET ?cursor=… — klanının biten savaşları (sonuç, skor, sana yapılan ödeme), imleçli
 * sayfalama (10'ar). Önceden savaş geçmişi hiç yoktu (customer_squads.md envanter 24).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getBattleHistory } from '@/lib/squads/battles';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'customer.squads.battle.history',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: 'read',
    query: z.object({ cursor: z.string().min(1).max(64).optional() }),
  },
  async ({ user, query }) => ok(await getBattleHistory(user.id, query.cursor ?? null))
);
