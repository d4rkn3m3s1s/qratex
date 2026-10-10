/** `POST /api/dealer/catalog/categories` — kategori oluştur (aynı adla görünür kategori varsa 409). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { categoryCreateSchema } from '@/lib/dealer/catalog/schemas';
import { createCategory } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.catalog.categories.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    idempotent: true,
    schema: categoryCreateSchema,
  },
  async ({ tenant, body }) => ok({ category: await createCategory(tenant.dealerId, body) }, { status: 201 })
);
