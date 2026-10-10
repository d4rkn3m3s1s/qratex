import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getVenueHistory, HISTORY_PAGE_SIZE } from '@/lib/venue-detail/history';

export const dynamic = 'force-dynamic';

/**
 * Mekân detayı — "Bu mekândaki geçmişim" sonraki sayfalar (ilk sayfa sunucu bileşeninde
 * gelir). Yalnız oturumdaki müşterinin kendi tüketim/geri bildirim kayıtları.
 */
export const GET = defineRoute(
  {
    name: 'customer.venue-detail.history',
    roles: ['CUSTOMER'],
    params: z.object({ dealerId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) }),
    query: z.object({
      cursor: z.string().datetime({ offset: true }).optional(),
      take: z.coerce.number().int().min(1).max(30).default(HISTORY_PAGE_SIZE),
    }),
    rateLimit: 'read',
    module: 'discovery',
  },
  async ({ params, query, user }) => ok(await getVenueHistory(user.id, params.dealerId, { cursor: query.cursor, take: query.take }))
);
