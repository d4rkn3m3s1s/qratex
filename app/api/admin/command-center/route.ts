/**
 * `GET /api/admin/command-center` — Komuta Merkezi BFF'i (`/admin`).
 *
 *   ?section=overview&range=24h|7d|30d   KPI + nabız + kuyruklar + ekosistem + bayi sıralaması
 *   ?section=health                      Platform sağlığı (15 sn önbellek)
 *   &fresh=1                             Sunucu önbelleğini atla ("Yenile")
 *
 * Sayfa ilk render'ı AYNI yükleyicilerle sunucuda yapar; bu uç tazeleme içindir.
 * Varsayılan reddet: yalnız ADMIN (+ yönetici kapısı, `requireAuth`). GET yan etkisiz, LLM yok.
 * Eski `/api/admin/dashboard`, `/platform-pulse`, `/ecosystem-summary`, `/tech-summary` uçlarının yerini alır.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadCommandHealth, loadCommandOverview } from '@/lib/admin-command/server';
import { COMMAND_RANGES, DEFAULT_COMMAND_RANGE } from '@/lib/admin-command/types';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.command-center',
    roles: ['ADMIN'],
    rateLimit: 'read',
    query: z.object({
      section: z.enum(['overview', 'health']).default('overview'),
      range: z.enum(COMMAND_RANGES).default(DEFAULT_COMMAND_RANGE),
      fresh: z.enum(['0', '1']).optional(),
    }),
  },
  async ({ query }) => {
    const fresh = query.fresh === '1';
    if (query.section === 'health') {
      const health = await loadCommandHealth({ fresh });
      return ok({ ...health.data, generatedAt: health.generatedAt });
    }
    return ok(await loadCommandOverview(query.range, { fresh }));
  }
);
