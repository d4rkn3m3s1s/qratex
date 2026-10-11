/**
 * POST /api/admin/economy/leagues/preview — taslak eşiklerle kaç müşteri lig değiştirir.
 * Salt okunur; kayıtlı kurallar sunucuda okunur (istemciye güvenilmez).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { deriveLeagueRanges, leaguePreviewBodySchema } from '@/lib/admin-economy/contract';
import { previewLeagues, readSavedLeagueRules } from '@/lib/admin-economy/server';
import type { LeagueRule } from '@/lib/league-rules-core';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.economy.leagues.preview', roles: ['ADMIN'], schema: leaguePreviewBodySchema, rateLimit: 'read' },
  async ({ body }) => {
    const saved = await readSavedLeagueRules();
    return ok(await previewLeagues(saved, deriveLeagueRanges(body.rules.map((r) => ({ ...r, maxPoints: 0, gradient: r.gradient ?? '' })) as LeagueRule[])));
  }
);
