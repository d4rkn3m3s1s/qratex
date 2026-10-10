/** `PATCH /api/dealer/catalog/categories/[id]` — ad / simge düzenle (yalnız bayinin kendi kategorisi). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { categoryUpdateSchema } from '@/lib/dealer/catalog/schemas';
import { updateCategory } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) });

export const PATCH = defineRoute(
  {
    name: 'dealer.catalog.categories.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    params,
    schema: categoryUpdateSchema,
  },
  async ({ tenant, params: p, body }) => ok({ category: await updateCategory(tenant.dealerId, p.id, body) })
);
