/** GET /api/admin/api-catalog yanıt gövdesi (lib/data/admin-api-catalog.json ile aynı şema). */
export type AdminApiCatalogRoute = { path: string; methods: string[]; file: string };

export type AdminApiCatalogPayload = {
  generatedAt: string;
  routes: AdminApiCatalogRoute[];
};
