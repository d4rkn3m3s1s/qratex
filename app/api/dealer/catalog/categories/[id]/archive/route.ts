/**
 * `POST /api/dealer/catalog/categories/[id]/archive` — kategoriyi arşivle (silme yok).
 * İçinde aktif ürün varsa `moveToCategoryId` zorunlu (yoksa 409 + `details.activeProducts`).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { archiveCategory } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';

const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const params = z.object({ id });
const Body = z.object({ moveToCategoryId: id.nullable().optional() });

export const POST = defineRoute(
  {
    name: 'dealer.catalog.categories.archive',
    roles: ['DEALER'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    params,
    schema: Body,
  },
  async ({ tenant, params: p, body }) => ok(await archiveCategory(tenant.dealerId, p.id, body.moveToCategoryId))
);
