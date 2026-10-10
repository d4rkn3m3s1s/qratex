import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getRemedyCounts, listRemedyOffers } from '@/lib/dealer-queues/remedy-server';
import { REMEDY_SOURCE_FILTERS, REMEDY_VIEWS, normalizeSearch } from '@/lib/dealer-queues/remedy-core';
import type { RemedyListResponse } from '@/lib/dealer-queues/types';

export const dynamic = 'force-dynamic';

const Query = z.object({
  view: z.enum(REMEDY_VIEWS).catch('awaiting'),
  source: z.enum(REMEDY_SOURCE_FILTERS).catch('all'),
  q: z.string().optional().transform((v) => normalizeSearch(v)),
  cursor: z.string().max(64).optional().nullable(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * Gelen Kutusu → Telafi onayı: görünüm listesi (imleçli) + ilk sayfada sayaçlar.
 * Salt okuma; hata zarfı v2 (boş liste ile karışmaz).
 */
export const GET = defineRoute(
  {
    name: 'dealer.queues.remedy.list',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'remedy_offers',
    rateLimit: 'read',
    query: Query,
  },
  async ({ tenant, query }) => {
    const [page, counts] = await Promise.all([
      listRemedyOffers(tenant.dealerId, {
        view: query.view,
        source: query.source,
        q: query.q,
        cursor: query.cursor ?? null,
        limit: query.limit,
      }),
      getRemedyCounts(tenant.dealerId),
    ]);
    const body: RemedyListResponse = { ...page, counts };
    return ok(body);
  }
);
