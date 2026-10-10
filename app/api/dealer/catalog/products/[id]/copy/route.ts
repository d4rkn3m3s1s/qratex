/** `POST /api/dealer/catalog/products/[id]/copy` — sistem ürününden bayiye ait kopya oluştur. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { copyGlobalProduct } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) });

export const POST = defineRoute(
  { name: 'dealer.catalog.products.copy', roles: ['DEALER'], tenant: 'dealer', rateLimit: 'mutation', idempotent: true, params },
  async ({ tenant, params: p }) => ok({ product: await copyGlobalProduct(tenant.dealerId, p.id) }, { status: 201 })
);
