/**
 * `POST /api/dealer/catalog/import` — CSV içe aktarma. `commit:false` → satır satır doğrulama
 * raporu (önizleme, yazma yok); `commit:true` → aynı karar tek işlemde yazılır (idempotent).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { productImportSchema } from '@/lib/dealer/catalog/schemas';
import { importProducts } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.catalog.import',
    roles: ['DEALER'],
    tenant: 'dealer',
    rateLimit: { max: 20, windowMs: 10 * 60_000, by: 'user' },
    idempotent: true,
    maxBodyBytes: 700 * 1024,
    schema: productImportSchema,
  },
  async ({ tenant, body }) => ok(await importProducts(tenant.dealerId, body.csv, body.onDuplicate, body.commit))
);
