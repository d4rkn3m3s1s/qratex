/** `POST /api/dealer/catalog/categories/reorder` — bayi kategorilerinin sırası (Kart Tara da `order`'a göre listeler). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { categoryReorderSchema } from '@/lib/dealer/catalog/schemas';
import { reorderCategories } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.catalog.categories.reorder',
    roles: ['DEALER'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    schema: categoryReorderSchema,
  },
  async ({ tenant, body }) => ok(await reorderCategories(tenant.dealerId, body.ids))
);
