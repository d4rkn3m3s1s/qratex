/** GET /api/admin/integrations/dealers?q= | ?ids=a,b — anahtar/partner bağlama için bayi arama (en fazla 20). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { DealerSearchQuery } from '@/lib/integrations/contract';
import { searchDealers } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.integrations.dealers', roles: ['ADMIN'], query: DealerSearchQuery, rateLimit: 'read' },
  async ({ query }) => ok({ items: await searchDealers(query.q, query.ids ? query.ids.split(',').filter(Boolean) : undefined) })
);
