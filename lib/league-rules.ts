import { prisma } from '@/lib/prisma';
import {
  LEAGUE_RULES_SETTING_KEY,
  DEFAULT_LEAGUE_RULES,
  normalizeLeagueRules,
  type LeagueRule,
} from '@/lib/league-rules-core';

export {
  LEAGUE_RULES_SETTING_KEY,
  LEAGUE_RULES_SETTING_CATEGORY,
  DEFAULT_LEAGUE_RULES,
  normalizeLeagueRules,
  getLeagueMetaFromRules,
  getNextLeagueMetaFromRules,
  getLeagueProgressFromRules,
} from '@/lib/league-rules-core';
export type { LeagueKey, LeagueRule } from '@/lib/league-rules-core';

type SettingsReader = {
  settings: {
    findUnique: (args: { where: { key: string }; select: { value: true } }) => Promise<{ value: unknown } | null>;
  };
};

const LEAGUE_RULES_CACHE_TTL_MS = 60_000; // 60s
let leagueRulesCache: { value: LeagueRule[]; expiresAt: number } | null = null;

/** Invalidate cache after admin updates league rules (called from settings route). */
export function clearLeagueRulesCache(): void {
  leagueRulesCache = null;
}

/** Server-only: reads league rules from DB. Use DEFAULT_LEAGUE_RULES or API response on client. */
export async function getLeagueRules(db: SettingsReader = prisma): Promise<LeagueRule[]> {
  const now = Date.now();
  if (leagueRulesCache && leagueRulesCache.expiresAt > now) {
    return leagueRulesCache.value;
  }
  const setting = await db.settings.findUnique({
    where: { key: LEAGUE_RULES_SETTING_KEY },
    select: { value: true },
  });
  const value = normalizeLeagueRules(setting?.value);
  leagueRulesCache = { value, expiresAt: now + LEAGUE_RULES_CACHE_TTL_MS };
  return value;
}
