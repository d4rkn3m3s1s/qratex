/**
 * `GET /api/dealer/catalog` — Ürün kataloğu BFF'i (sayfa, kategoriler, içgörüler).
 *
 * Varsayılan reddet: DEALER (kendi işletmesi) ve ADMIN (yalnız `?dealerId=`, salt-okunur).
 * Sorgu `parseCatalogQuery` ile SSR sayfasıyla birebir aynı ayrıştırılır (`?search=` global
 * arama derin bağlantısı da kabul edilir). GET yan etkisizdir.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { parseCatalogQuery } from '@/lib/dealer/catalog/schemas';
import { loadCatalogPage } from '@/lib/dealer/catalog/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.catalog', roles: ['DEALER', 'ADMIN'], tenant: 'dealer', rateLimit: 'read' },
  async ({ tenant, query }) =>
    ok(await loadCatalogPage(tenant.dealerId, parseCatalogQuery(query), { canWrite: tenant.via !== 'admin' }))
);
