/**
 * GET /api/admin/cards/batches — üretim partileri (sayfalı). Durum dağılımı TEK `groupBy` ile
 * (eskiden parti başına ayrı sorgu: sınırsız N+1), son dışa aktarım denetim kaydından.
 * `?options=1` → filtre seçicisi için en yeni 200 parti (ad + kimlik).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { batchListQuerySchema } from '@/lib/admin-cards/contract';
import { batchOptions, listBatches } from '@/lib/admin-cards/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.cards.batches',
    roles: ['ADMIN'],
    query: batchListQuerySchema.extend({ options: z.enum(['1']).optional() }),
    rateLimit: 'read',
  },
  async ({ query }) => (query.options ? ok({ items: await batchOptions() }) : ok(await listBatches(query)))
);
