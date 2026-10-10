/** `POST /api/dealer/catalog/categories/[id]/restore` — arşivlenmiş kategoriyi geri yükle. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { updateCategory } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) });

export const POST = defineRoute(
  { name: 'dealer.catalog.categories.restore', roles: ['DEALER'], tenant: 'dealer', rateLimit: 'mutation', params },
  async ({ tenant, params: p }) => ok({ category: await updateCategory(tenant.dealerId, p.id, { isActive: true }) })
);
