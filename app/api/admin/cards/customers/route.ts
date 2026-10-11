/** GET /api/admin/cards/customers?q= — atama diyaloğu için hafif müşteri arama (yalnız id/ad/e-posta). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { customerLookupQuerySchema } from '@/lib/admin-cards/contract';
import { lookupCustomers } from '@/lib/admin-cards/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.cards.customers', roles: ['ADMIN'], query: customerLookupQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok({ items: await lookupCustomers(query.q) })
);
