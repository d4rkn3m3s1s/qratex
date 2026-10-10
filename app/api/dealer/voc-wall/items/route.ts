/** Küratörlük listesi (GET, sayfalı): her yorumun ekrandaki durumu ve nedeni. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { CURATION_FILTERS } from '@/lib/dealer/voc-wall/config';
import { loadCurationPage } from '@/lib/dealer/voc-wall/server';

export const dynamic = 'force-dynamic';

const Query = z.object({
  filter: z.enum(CURATION_FILTERS).default('all'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  qrCodeId: z.string().min(1).max(64).optional(),
  dealerId: z.string().optional(),
});

export const GET = defineRoute(
  {
    name: 'dealer.voc-wall.items',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    module: 'voc_wall',
    rateLimit: 'read',
    query: Query,
  },
  async ({ tenant, query }) =>
    ok(await loadCurationPage(tenant.dealerId, { filter: query.filter, page: query.page, qrCodeId: query.qrCodeId ?? null }))
);
