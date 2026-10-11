import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { getGamesOverview, parsePatch, patchGame, resetGame } from '@/lib/admin-games/server';

export const dynamic = 'force-dynamic';

/**
 * /api/admin/games — Oyun Kontrol Odası BFF (yalnız ADMIN; defineRoute: rol + rate limit + zarf v2).
 * GET    → genel bakış: her oyun (registry + pacman) varsayılan/ham override/etkin değerler,
 *          portföy durumu, huni (bugün İstanbul + 30g), bütünlük sinyali, KPI, sınırlar.
 * PATCH  → tek oyunun override'ı: YALNIZ gönderilen alanlar, ekonomi sınırları, eşik ≤ maks.,
 *          Türkçe alan adlı hata, `expectedUpdatedAt` → 409, audit oldData+newData, anında önbellek düşürme.
 * DELETE → `?gameType=` override'ları sıfırlar (kapalı oyun kapalı kalır).
 * `legacySpread`: eski `{ success, games }` okuyucuları için kök alanlar korunur.
 */

export const GET = defineRoute(
  { name: 'admin.games.overview', roles: ['ADMIN'], rateLimit: 'read' },
  async () => ok(await getGamesOverview(), { legacySpread: true })
);

export const PATCH = defineRoute(
  { name: 'admin.games.patch', roles: ['ADMIN'], rateLimit: 'mutation' },
  async ({ request, user }) => {
    const raw = await request.json().catch(() => null);
    const input = parsePatch(raw);
    return ok(await patchGame(user.id, input, getAuditRequestMeta(request)), { legacySpread: true });
  }
);

export const DELETE = defineRoute(
  {
    name: 'admin.games.reset',
    roles: ['ADMIN'],
    rateLimit: 'mutation',
    query: z.object({ gameType: z.string().min(1).max(64) }),
  },
  async ({ request, user, query }) =>
    ok(await resetGame(user.id, query.gameType, getAuditRequestMeta(request)), { legacySpread: true })
);
