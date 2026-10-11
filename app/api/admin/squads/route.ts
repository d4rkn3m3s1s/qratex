/**
 * GET /api/admin/squads — Klan Merkezi liste BFF'i (sunucu sayfalama, durum filtresi, sıralama).
 * Eski `PATCH {squadId, action:'freeze'}` kaldırıldı: dondurma gerekçeli, denetimli ve gerçekten
 * uygulanan `POST /api/admin/squads/[id]/actions` üzerinden yapılır.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { squadListQuerySchema } from '@/lib/admin-squads/contract';
import { listSquads } from '@/lib/admin-squads/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.squads.list', roles: ['ADMIN'], query: squadListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listSquads(query))
);
