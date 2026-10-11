/**
 * Mini oyunların ETKİN (effective) yapılandırması = registry varsayılanı + admin
 * DB override'ı. Registry (lib/minigame-config.ts MINI_GAMES + PACMAN_GAME) hard-coded
 * varsayılanı tutar; admin `MiniGameConfig` satırıyla alanları ezer. Override alanı null
 * ise registry değeri geçerlidir.
 *
 * Server tarafı (start/complete/leaderboard/turnuva) ödülü DAİMA bu effective değerlerden
 * hesaplar — client'ın bildirdiği skora/ayara güvenilmez. Admin paneli de aynı
 * birleştirmeyi (`mergeGameConfig`) okur: tek birleştirme fonksiyonu, tek test.
 *
 * Ekonomi korumaları (admin B4): override değerleri OKUMA anında da sınırlara kırpılır
 * (`OVERRIDE_LIMITS`). Böylece DB'ye bir şekilde 1.000.000 puan / 0 sn yazılmış olsa
 * bile oyun tamamlama bunu basamaz (savunma derinliği; PATCH de aynı sınırları uygular).
 *
 * Önbellek: unstable_cache 60 sn; admin değişikliği `revalidateTag(tag, { expire: 0 })`
 * ile anında düşürür. Puan basan karar (complete) önbelleği HİÇ kullanmaz:
 * `getEffectiveMiniGameFresh` tek satırı doğrudan okur (kapat düğmesi = derhal kesme).
 */
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  MINI_GAMES,
  DEFAULT_MAX_DURATION_SEC,
  defaultEnabledOf,
  getGameDef,
  type MiniGameDef,
} from '@/lib/minigame-config';

export const MINIGAME_CONFIG_TAG = 'minigame-config';

/** Admin override'larının ekonomi güvenli sınırları (PATCH zod'u ve okuma kırpması). */
export const OVERRIDE_LIMITS = {
  rewardPoints: { min: 0, max: 1000 },
  rewardXp: { min: 0, max: 500 },
  rewardThreshold: { min: 1, max: 10_000 },
  maxScore: { min: 1, max: 10_000 },
  /** 3 sn altı bot korumasını fiilen kapatır (admin B4). */
  minDurationSec: { min: 3, max: 600 },
  titleMax: 40,
  descriptionMax: 200,
} as const;

/** Etkin oyun tanımı: registry alanları + enabled bayrağı. */
export interface EffectiveMiniGame extends MiniGameDef {
  /** Oyun açık mı (admin pasifleştirebilir). */
  enabled: boolean;
  /** Etkin deneme penceresi (sn) — registry'de tanımsızsa varsayılan. */
  maxDurationSec: number;
}

export type OverrideRow = {
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

const OVERRIDE_SELECT = {
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
} as const;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clampInt(n: number, lim: { min: number; max: number }): number {
  return Math.max(lim.min, Math.min(lim.max, Math.floor(n)));
}

/**
 * Bir registry tanımına override satırını uygular (null/negatif/boş alanlar yok sayılır,
 * sayılar ekonomi sınırlarına kırpılır, geçersiz renk varsayılana düşer).
 */
export function mergeGameConfig(def: MiniGameDef, ov: OverrideRow | null | undefined): EffectiveMiniGame {
  const base: EffectiveMiniGame = {
    ...def,
    // İsteğe bağlı oyun (optIn) override satırı yokken KAPALI; admin açar.
    enabled: defaultEnabledOf(def),
    maxDurationSec: def.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC,
  };
  if (!ov) return base;
  const nonEmpty = (s: string | null) => (s != null && s.trim().length > 0 ? s.trim() : undefined);
  const num = (n: number | null, lim: { min: number; max: number }) =>
    n != null && Number.isFinite(n) && n >= 0 ? clampInt(n, lim) : undefined;
  const accent = nonEmpty(ov.accent);
  const maxScore = num(ov.maxScore, OVERRIDE_LIMITS.maxScore) ?? def.maxScore;
  return {
    ...base,
    enabled: ov.enabled,
    rewardPoints: num(ov.rewardPoints, OVERRIDE_LIMITS.rewardPoints) ?? def.rewardPoints,
    rewardXp: num(ov.rewardXp, OVERRIDE_LIMITS.rewardXp) ?? def.rewardXp,
    rewardThreshold: num(ov.rewardThreshold, OVERRIDE_LIMITS.rewardThreshold) ?? def.rewardThreshold,
    minDurationSec: num(ov.minDurationSec, OVERRIDE_LIMITS.minDurationSec) ?? def.minDurationSec,
    maxScore,
    title: nonEmpty(ov.title)?.slice(0, OVERRIDE_LIMITS.titleMax) ?? def.title,
    description: nonEmpty(ov.description)?.slice(0, OVERRIDE_LIMITS.descriptionMax) ?? def.description,
    emoji: nonEmpty(ov.emoji) ?? def.emoji,
    accent: accent && HEX_COLOR_RE.test(accent) ? accent : def.accent,
  };
}

const loadOverrides = unstable_cache(
  async (): Promise<Record<string, OverrideRow>> => {
    try {
      const rows = await prisma.miniGameConfig.findMany({ select: OVERRIDE_SELECT });
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

/** Tüm registry oyunlarının etkin yapılandırması (registry sırasında; pacman hariç). */
export async function getEffectiveMiniGames(): Promise<EffectiveMiniGame[]> {
  const overrides = await loadOverrides();
  return MINI_GAMES.map((def) => mergeGameConfig(def, overrides[def.gameType]));
}

/** Tek bir oyunun etkin yapılandırması (pacman dahil). Bilinmeyen tip → null. */
export async function getEffectiveMiniGame(gameType: string): Promise<EffectiveMiniGame | null> {
  const def = getGameDef(gameType);
  if (!def) return null;
  const overrides = await loadOverrides();
  return mergeGameConfig(def, overrides[gameType]);
}

/**
 * Önbelleksiz etkin yapılandırma — PUAN BASAN karar için (complete). Admin "kapat"
 * dediği anda süren denemeler de ödülsüz kapanır. DB hatası yukarı fırlar (fail-closed:
 * ödül kararı bilinmeyen config ile verilmez).
 */
export async function getEffectiveMiniGameFresh(gameType: string): Promise<EffectiveMiniGame | null> {
  const def = getGameDef(gameType);
  if (!def) return null;
  const ov = await prisma.miniGameConfig.findUnique({ where: { gameType }, select: OVERRIDE_SELECT });
  return mergeGameConfig(def, ov);
}

/** Effective tanım + skora göre sunucu ödülü (cap'li, eşikli). computeGameReward'ın
 *  effective sürümü. */
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

/** İstemciye giden yapılandırma (eşik/ödül/görsel). Gizli alan yok — skor kararı sunucuda. */
export function publicGameConfig(game: EffectiveMiniGame) {
  return {
    gameType: game.gameType,
    title: game.title,
    description: game.description,
    emoji: game.emoji,
    accent: game.accent,
    maxScore: game.maxScore,
    rewardThreshold: game.rewardThreshold,
    rewardPoints: game.rewardPoints,
    rewardXp: game.rewardXp,
    minDurationSec: game.minDurationSec,
    maxDurationSec: game.maxDurationSec,
  };
}
