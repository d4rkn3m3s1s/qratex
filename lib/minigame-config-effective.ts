/**
 * Mini oyunların ETKİN (effective) yapılandırması = registry varsayılanı + admin
 * DB override'ı. Registry (lib/minigame-config.ts MINI_GAMES) hard-coded varsayılanı
 * tutar; admin `MiniGameConfig` satırıyla alanları ezer. Override alanı null ise
 * registry değeri geçerlidir.
 *
 * Server tarafı (start/complete/leaderboard) ödülü DAİMA bu effective değerlerden
 * hesaplar — client'ın bildirdiği skora/ayara güvenilmez. Admin paneli de aynı
 * birleştirmeyi okur.
 *
 * unstable_cache ile 60sn cache; admin ayar değiştirince revalidateTag ile bayatlatır.
 */
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { MINI_GAMES, getMiniGame, type MiniGameDef } from '@/lib/minigame-config';

export const MINIGAME_CONFIG_TAG = 'minigame-config';

/** Etkin oyun tanımı: registry alanları + enabled bayrağı. */
export interface EffectiveMiniGame extends MiniGameDef {
  /** Oyun açık mı (admin pasifleştirebilir). */
  enabled: boolean;
}

type OverrideRow = {
  gameType: string;
  enabled: boolean;
  rewardPoints: number | null;
  rewardXp: number | null;
  rewardThreshold: number | null;
  minDurationSec: number | null;
  maxScore: number | null;
  title: string | null;
  description: string | null;
  emoji: string | null;
  accent: string | null;
};

/** Bir registry tanımına override satırını uygular (null alanlar yok sayılır). */
function mergeOne(def: MiniGameDef, ov: OverrideRow | undefined): EffectiveMiniGame {
  if (!ov) return { ...def, enabled: true };
  const nonEmpty = (s: string | null) => (s != null && s.trim().length > 0 ? s.trim() : undefined);
  const pos = (n: number | null) => (n != null && n >= 0 ? n : undefined);
  return {
    ...def,
    enabled: ov.enabled,
    rewardPoints: pos(ov.rewardPoints) ?? def.rewardPoints,
    rewardXp: pos(ov.rewardXp) ?? def.rewardXp,
    rewardThreshold: pos(ov.rewardThreshold) ?? def.rewardThreshold,
    minDurationSec: pos(ov.minDurationSec) ?? def.minDurationSec,
    maxScore: pos(ov.maxScore) ?? def.maxScore,
    title: nonEmpty(ov.title) ?? def.title,
    description: nonEmpty(ov.description) ?? def.description,
    emoji: nonEmpty(ov.emoji) ?? def.emoji,
    accent: nonEmpty(ov.accent) ?? def.accent,
  };
}

const loadOverrides = unstable_cache(
  async (): Promise<Record<string, OverrideRow>> => {
    try {
      const rows = await prisma.miniGameConfig.findMany({
        select: {
          gameType: true,
          enabled: true,
          rewardPoints: true,
          rewardXp: true,
          rewardThreshold: true,
          minDurationSec: true,
          maxScore: true,
          title: true,
          description: true,
          emoji: true,
          accent: true,
        },
      });
      const map: Record<string, OverrideRow> = {};
      for (const r of rows) map[r.gameType] = r;
      return map;
    } catch {
      // DB erişilemezse override yok → registry varsayılanları (oyunlar açık kalır).
      return {};
    }
  },
  ['minigame-config-overrides'],
  { revalidate: 60, tags: [MINIGAME_CONFIG_TAG] }
);

/** Tüm oyunların etkin yapılandırması (registry sırasında). */
export async function getEffectiveMiniGames(): Promise<EffectiveMiniGame[]> {
  const overrides = await loadOverrides();
  return MINI_GAMES.map((def) => mergeOne(def, overrides[def.gameType]));
}

/** Tek bir oyunun etkin yapılandırması. Bilinmeyen tip → null. */
export async function getEffectiveMiniGame(
  gameType: string
): Promise<EffectiveMiniGame | null> {
  const def = getMiniGame(gameType);
  if (!def) return null;
  const overrides = await loadOverrides();
  return mergeOne(def, overrides[gameType]);
}

/** Effective tanım + skora göre sunucu ödülü (cap'li, eşikli). computeGameReward'ın
 *  effective sürümü — start/complete bunu kullanır. */
export function computeEffectiveReward(
  game: EffectiveMiniGame,
  score: number
): { points: number; xp: number } {
  const s = Math.max(0, Math.min(game.maxScore, Math.floor(score)));
  if (s >= game.rewardThreshold) {
    return { points: game.rewardPoints, xp: game.rewardXp };
  }
  return { points: 0, xp: 0 };
}
