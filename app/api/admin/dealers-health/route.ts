/**
 * GET /api/admin/dealers-health — Bayi Sağlığı listesi (tek skor + şeffaf bileşenler).
 * Sunucu tarafı filtre/sıralama/sayfa; özet filtresiz evren üzerinden. `fresh=1` önbelleği yeniler.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { ListQuery } from '@/components/admin/a-bayi-sagligi/server/schemas';
import { getHealthList } from '@/components/admin/a-bayi-sagligi/server/list';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.dealers-health.list', roles: ['ADMIN'], query: ListQuery, rateLimit: 'read' },
  async ({ query }) =>
    ok(
      await getHealthList({
        window: query.window,
        q: query.q || null,
        band: query.band ?? null,
        flag: query.flag ?? null,
        sort: query.sort ?? null,
        page: query.page ?? 1,
        size: query.size ?? 20,
        fresh: query.fresh === '1',
      })
    )
);
