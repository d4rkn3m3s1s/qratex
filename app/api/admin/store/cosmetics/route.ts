/**
 * GET  /api/admin/store/cosmetics — Kozmetik kataloğu (tür/durum/nadirlik/arama/sıralama, sahip ve 30 gün satış).
 * POST /api/admin/store/cosmetics — Yeni ürün (türe göre görünüm doğrulaması, varsayılan satışta değil).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { cosmeticListQuerySchema, cosmeticUpsertSchema } from '@/lib/admin-store/contract';
import { createCosmetic, listCosmetics } from '@/lib/admin-store/cosmetics.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.store.cosmetics.list', roles: ['ADMIN'], query: cosmeticListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listCosmetics(query))
);

export const POST = defineRoute(
  { name: 'admin.store.cosmetics.create', roles: ['ADMIN'], schema: cosmeticUpsertSchema, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await createCosmetic(body, actorFromSession(session), request), { status: 201 })
);
