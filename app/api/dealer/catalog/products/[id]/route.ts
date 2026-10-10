/**
 * `GET /api/dealer/catalog/products/[id]` — ürün detayı (30 gün puan dağılımı, 8 haftalık
 * seri, son değerlendirmeler). `PATCH` — güncelle / arşivle / geri yükle (`isActive`);
 * `baseUpdatedAt` sunucudakinden farklıysa 409.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { productUpdateSchema } from '@/lib/dealer/catalog/schemas';
import { loadProductDetail } from '@/lib/dealer/catalog/server';
import { updateProduct } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) });

export const GET = defineRoute(
  { name: 'dealer.catalog.products.detail', roles: ['DEALER', 'ADMIN'], tenant: 'dealer', rateLimit: 'read', params },
  async ({ tenant, params: p }) => {
    const detail = await loadProductDetail(tenant.dealerId, p.id, { canWrite: tenant.via !== 'admin' });
    if (!detail) throw new ApiError('NOT_FOUND', 'Ürün bulunamadı.');
    return ok(detail);
  }
);

export const PATCH = defineRoute(
  {
    name: 'dealer.catalog.products.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    params,
    schema: productUpdateSchema,
  },
  async ({ tenant, params: p, body }) => ok({ product: await updateProduct(tenant.dealerId, p.id, body) })
);
