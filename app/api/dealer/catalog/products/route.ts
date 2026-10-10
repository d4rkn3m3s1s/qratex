/** `POST /api/dealer/catalog/products` — ürün oluştur (yalnız DEALER; idempotent; aynı ad 409). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { productCreateSchema } from '@/lib/dealer/catalog/schemas';
import { createProduct } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.catalog.products.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    idempotent: true,
    schema: productCreateSchema,
  },
  async ({ tenant, body }) => ok({ product: await createProduct(tenant.dealerId, body) }, { status: 201 })
);
