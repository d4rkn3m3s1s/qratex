import type { LeagueKey } from '@/lib/league-rules';

/**
 * Sürpriz kutusu içerik kuralları: Hangi ligte hangi tip ödüller verilebilir.
 * Admin veya kampanya tarafında güncellenebilir; bu config varsayılan/örnek değerlerdir.
 */
export type SurpriseRewardType = 'points' | 'coupon' | 'badge' | 'reward';

export interface SurpriseBoxLeagueConfig {
  leagueKey: LeagueKey;
  /** Bu ligte çıkabilecek ödül tipleri */
  rewardTypes: SurpriseRewardType[];
  /** Min–max puan (opsiyonel) */
  pointsRange?: { min: number; max: number };
  /** Kupon kategorisi veya kampanya kodu öneki (opsiyonel) */
  couponPrefix?: string;
}

export const SURPRISE_BOX_LEAGUE_CONFIG: SurpriseBoxLeagueConfig[] = [
  { leagueKey: 'BASLANGIC', rewardTypes: ['points', 'coupon'], pointsRange: { min: 10, max: 100 } },
  { leagueKey: 'KOR', rewardTypes: ['points', 'coupon'], pointsRange: { min: 50, max: 200 } },
  { leagueKey: 'VEYRA', rewardTypes: ['points', 'coupon'], pointsRange: { min: 100, max: 350 } },
  { leagueKey: 'SAVASCI', rewardTypes: ['points', 'coupon', 'badge'], pointsRange: { min: 150, max: 500 } },
  { leagueKey: 'ETERON', rewardTypes: ['points', 'coupon', 'badge', 'reward'], pointsRange: { min: 200, max: 750 } },
  { leagueKey: 'VETRA', rewardTypes: ['points', 'coupon', 'badge', 'reward'], pointsRange: { min: 300, max: 1000 } },
  { leagueKey: 'ZENOR', rewardTypes: ['points', 'coupon', 'badge', 'reward'], pointsRange: { min: 500, max: 2000 } },
];

/** Lig key ile config döner */
export function getSurpriseBoxConfig(leagueKey: LeagueKey): SurpriseBoxLeagueConfig | undefined {
  return SURPRISE_BOX_LEAGUE_CONFIG.find((c) => c.leagueKey === leagueKey);
}
