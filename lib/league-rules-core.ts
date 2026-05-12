/**
 * Pure league rules: types, defaults, and helpers. Safe to import from client/utils.
 * For server-only getLeagueRules(prisma) use @/lib/league-rules.
 */

import { TW_BRAND_GRADIENT_STOPS_WIDE } from '@/lib/tw-brand-classes';

export const LEAGUE_RULES_SETTING_KEY = 'league_rules';
export const LEAGUE_RULES_SETTING_CATEGORY = 'gamification';

export type LeagueKey =
  | 'BASLANGIC'
  | 'KOR'
  | 'VEYRA'
  | 'SAVASCI'
  | 'ETERON'
  | 'VETRA'
  | 'ZENOR';

export interface LeagueRule {
  key: LeagueKey;
  name: string;
  minPoints: number;
  maxPoints: number;
  gradient: string;
}

/** Ardışık puan aralıkları (boşluk yok). Admin Lig Ayarlarından düzenlenebilir. */
export const DEFAULT_LEAGUE_RULES: LeagueRule[] = [
  { key: 'BASLANGIC', name: 'Başlangıç', minPoints: 0, maxPoints: 2999, gradient: 'from-slate-500 to-slate-700' },
  { key: 'KOR', name: 'Kor', minPoints: 3000, maxPoints: 5000, gradient: 'from-amber-700 to-orange-500' },
  { key: 'VEYRA', name: 'Veyra', minPoints: 5001, maxPoints: 10000, gradient: 'from-slate-400 to-slate-600' },
  { key: 'SAVASCI', name: 'Savaşçı', minPoints: 10001, maxPoints: 15000, gradient: 'from-yellow-400 to-amber-600' },
  { key: 'ETERON', name: 'Eteron', minPoints: 15001, maxPoints: 21000, gradient: 'from-cyan-400 to-sky-600' },
  { key: 'VETRA', name: 'Vetra', minPoints: 21001, maxPoints: 30000, gradient: 'from-primary to-primary/70' },
  { key: 'ZENOR', name: 'Zenor', minPoints: 30001, maxPoints: 100000, gradient: TW_BRAND_GRADIENT_STOPS_WIDE },
];

const VALID_KEYS: LeagueKey[] = [
  'BASLANGIC',
  'KOR',
  'VEYRA',
  'SAVASCI',
  'ETERON',
  'VETRA',
  'ZENOR',
];

function clampNonNegative(n: number): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

export function normalizeLeagueRules(value: unknown): LeagueRule[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_LEAGUE_RULES;
  const result: LeagueRule[] = [];
  for (let i = 0; i < value.length; i++) {
    const raw = value[i];
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const key = VALID_KEYS.includes(o.key as LeagueKey) ? (o.key as LeagueKey) : DEFAULT_LEAGUE_RULES[i]?.key ?? VALID_KEYS[i];
    const def = DEFAULT_LEAGUE_RULES.find((r) => r.key === key) ?? DEFAULT_LEAGUE_RULES[i] ?? DEFAULT_LEAGUE_RULES[0];
    result.push({
      key,
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : def.name,
      minPoints: clampNonNegative(typeof o.minPoints === 'number' && !Number.isNaN(o.minPoints) ? o.minPoints : def.minPoints),
      maxPoints: clampNonNegative(typeof o.maxPoints === 'number' && !Number.isNaN(o.maxPoints) ? o.maxPoints : def.maxPoints),
      gradient: typeof o.gradient === 'string' && o.gradient.trim() ? o.gradient.trim() : def.gradient,
    });
  }
  if (result.length === 0) return DEFAULT_LEAGUE_RULES;
  return result.sort((a, b) => a.minPoints - b.minPoints);
}

export function getLeagueMetaFromRules(points: number, rules: LeagueRule[]) {
  const p = Math.max(0, points);
  const list = rules.length ? rules : DEFAULT_LEAGUE_RULES;
  return list.find((r) => p >= r.minPoints && p <= r.maxPoints) ?? list[0];
}

export function getNextLeagueMetaFromRules(points: number, rules: LeagueRule[]) {
  const list = rules.length ? rules : DEFAULT_LEAGUE_RULES;
  const current = getLeagueMetaFromRules(points, list);
  const idx = list.findIndex((r) => r.key === current.key);
  if (idx === -1 || idx === list.length - 1) return null;
  return list[idx + 1];
}

export function getLeagueProgressFromRules(points: number, rules: LeagueRule[]): number {
  const list = rules.length ? rules : DEFAULT_LEAGUE_RULES;
  const current = getLeagueMetaFromRules(points, list);
  if (current.maxPoints >= 100000) return 100;
  const span = current.maxPoints - current.minPoints + 1;
  const progress = Math.max(0, points - current.minPoints) + 1;
  return Math.max(0, Math.min(100, Math.floor((progress / span) * 100)));
}
