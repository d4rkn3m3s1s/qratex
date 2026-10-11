/** GET /api/admin/discovery/dealers?q= | ?ids= — yalnız DEALER rolündeki işletmeleri arar (rol filtresi kaybolmaz). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { dealerSearchSchema } from '@/lib/admin-discovery/contract';
import { searchDealers } from '@/lib/admin-discovery/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.discovery.dealers', roles: ['ADMIN'], query: dealerSearchSchema, rateLimit: 'read' },
  async ({ query }) => ok({ items: await searchDealers(prisma, query.q, query.ids) })
);
