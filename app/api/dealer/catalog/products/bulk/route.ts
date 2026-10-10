/** `POST /api/dealer/catalog/products/bulk` — toplu arşivle / geri yükle / taşı / yüzde fiyat (≤ 200). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { productBulkSchema } from '@/lib/dealer/catalog/schemas';
import { bulkProducts } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.catalog.products.bulk',
    roles: ['DEALER'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    idempotent: true,
    schema: productBulkSchema,
  },
  async ({ tenant, body }) => ok(await bulkProducts(tenant.dealerId, body))
);
