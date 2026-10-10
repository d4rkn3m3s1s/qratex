/**
 * GET ?q=… — rakip klan arama (meydan okuma fişi). Önceden rakip yalnız global top-10'dan
 * seçilebiliyordu (customer_squads.md envanter 14). Askıdaki klanlar ve kendi klanın hariç;
 * açık savaşı olan klan `busy` işaretli döner.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { searchSquads } from '@/lib/squads/battles';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'customer.squads.search',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: { max: 60, windowMs: 60_000, by: 'user' },
    query: z.object({ q: z.string().trim().max(40).default('') }),
  },
  async ({ user, query }) => ok({ items: await searchSquads(user.id, query.q) })
);
