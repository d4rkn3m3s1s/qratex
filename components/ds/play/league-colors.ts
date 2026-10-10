/**
 * Lig amblem renkleri.
 *
 * `lib/moments/scene-colors.ts` (An Motoru `LEAGUE_SCENE_COLORS`) henüz yok; bu
 * küçük tablo onun yerine geçer. `LeagueRule.gradient` yalnız Tailwind sınıfı
 * tuttuğu (ve ham palet içerdiği) için kullanılmaz. Değerler CSS rengi olarak
 * TOKEN'lardan türer → açık/koyu tema ve tema preset'leri otomatik izlenir.
 * An Motoru tablosu geldiğinde bu dosya oradan beslenecek şekilde değiştirilebilir.
 */
import type { LeagueKey } from '@/lib/league-rules-core';

export type LeagueColors = {
  from: string;
  via?: string;
  to: string;
  /** Kademe (0 = Başlangıç). Amblem üstündeki kademe noktaları. */
  tier: number;
};

export const LEAGUE_ORDER: readonly LeagueKey[] = ['BASLANGIC', 'KOR', 'VEYRA', 'SAVASCI', 'ETERON', 'VETRA', 'ZENOR'];

export const LEAGUE_EMBLEM_COLORS: Record<LeagueKey, LeagueColors> = {
  BASLANGIC: { from: 'hsl(var(--text-3))', to: 'hsl(var(--text-2))', tier: 0 },
  KOR: { from: 'hsl(var(--category-7))', to: 'hsl(var(--category-5))', tier: 1 },
  VEYRA: { from: 'hsl(var(--border-strong))', to: 'hsl(var(--category-2))', tier: 2 },
  SAVASCI: { from: 'hsl(var(--category-4))', to: 'hsl(var(--category-7))', tier: 3 },
  ETERON: { from: 'hsl(var(--category-6))', to: 'hsl(var(--category-2))', tier: 4 },
  VETRA: { from: 'hsl(var(--category-1))', to: 'hsl(var(--category-8))', tier: 5 },
  ZENOR: { from: 'hsl(var(--category-5))', via: 'hsl(var(--category-1))', to: 'hsl(var(--category-2))', tier: 6 },
};

/** Bilinmeyen anahtar → marka gradient'i (An Motoru spec'iyle aynı karar). */
export const LEAGUE_FALLBACK_COLORS: LeagueColors = {
  from: 'hsl(var(--gradient-from))',
  to: 'hsl(var(--gradient-to))',
  tier: 0,
};

export function isLeagueKey(key: unknown): key is LeagueKey {
  return typeof key === 'string' && (LEAGUE_ORDER as readonly string[]).includes(key);
}

export function getLeagueColors(key: string | null | undefined): LeagueColors {
  const k = typeof key === 'string' ? key.trim().toUpperCase() : '';
  return isLeagueKey(k) ? LEAGUE_EMBLEM_COLORS[k] : LEAGUE_FALLBACK_COLORS;
}
