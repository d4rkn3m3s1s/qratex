/**
 * Oyun kayıt defteri — portföyün TEK kaynağı (yol haritası §7.3; 22 → 10 + 3 yeni).
 *
 * İstemci güvenli: bileşen yükleyicileri tembel (`import()`), etiketli içerik ve
 * doğrulayıcı YOK (onlar `<id>.server.ts` → `server.ts`).
 *
 * Sunucu kuralları (eşik, ödül, süre, makullük) bugün `lib/minigame-config.ts` MINI_GAMES /
 * PACMAN_GAME'de; `gameType` alanı ikisini bağlar. Hub/navigasyon bu dosyayı okur;
 * dinamik rota `app/customer/games/[game]` `resolveGameRoute` ile karar verir.
 *
 * Portföy tavanı 12 (§7.2 ilke 4): Mekân Bilgi Yarışması canlıya çıktığında en zayıf
 * performanslı oyun (D7 dönüşü + oynanma payı) `retired`'a alınır (registry testi denetler).
 */
import type { GameEntry, LegacyAlias, RetiredGame } from './types';
import { fakeHunterGame } from './fake-hunter';
import { mindThiefGame } from './mind-thief';
import { coreDefenseGame } from './core-defense';
import { frostCatcherGame } from './frost-catcher';
import { starHuntGame } from './star-hunt';
import { dataSnakeGame } from './data-snake';
import { reviewStackGame } from './review-stack';
import { spamBreakerGame } from './spam-breaker';
import { trustMergeGame } from './trust-merge';
import { signalPipeGame } from './signal-pipe';
import { dailyWordGame } from './daily-word';
import { matchThreeGame } from './match-three';
import { venueQuizGame } from './venue-quiz';

export * from './types';

/** Portföyde aynı anda canlı olabilecek en fazla oyun. */
export const PORTFOLIO_CAP = 12;

/** Hedef portföy (13 oyun; sıra = hub'daki varsayılan sıra, amiral başta). */
export const GAMES: readonly GameEntry[] = [
  fakeHunterGame,
  mindThiefGame,
  coreDefenseGame,
  frostCatcherGame,
  starHuntGame,
  dataSnakeGame,
  reviewStackGame,
  spamBreakerGame,
  trustMergeGame,
  signalPipeGame,
  dailyWordGame,
  matchThreeGame,
  venueQuizGame,
];

/**
 * Emekliye ayrılan 6 oyun (§7.3 KALDIR). Kod ve geçmiş veri silinmez; sunucu tarafında
 * `hidden` olarak işaretlenmeleri, turnuva rotasyon adayı sabitlendikten sonra yapılır
 * (README "Turnuva rotasyonu tuzağı").
 */
export const RETIRED_GAMES: readonly RetiredGame[] = [
  {
    id: 'speed-order',
    title: 'Hız Sıralama',
    reason: 'Schulte tablosu ürünle bağ kurmuyor; tek hatada tur kilitleniyordu (§7.3 #17).',
    successor: null,
  },
  {
    id: 'memory-match',
    title: 'Hafıza Eşleştir',
    reason: 'Sabit 8 emoji, seviyesiz; casual rolünü Eşleştir-3 üstlenir (§7.3 #18).',
    successor: 'match-three',
  },
  {
    id: 'combo-tap',
    title: 'Kombo Yıldız',
    reason: 'Zihin Hırsızı’nın sade kopyası (§7.3 #19).',
    successor: 'mind-thief',
  },
  {
    id: 'lucky-wheel',
    title: 'Şans Çarkı',
    reason: 'Saf şans; açıklamadaki beceri yok, sunucu otoriter günlük çarkla çakışıyor (§7.3 #20).',
    successor: null,
  },
  {
    id: 'data-miner',
    title: 'Veri Madencisi',
    reason: 'Saf şans; skor tavanına ulaşılamıyordu (§7.3 #21).',
    successor: null,
  },
  {
    id: 'network-defender',
    title: 'Ağ Savunucusu',
    reason: 'İyi oynayan kaybediyordu; portföy tavanı nedeniyle emekli, veri desteklerse "Salgın Durdur" olarak döner (§7.3 #16).',
    successor: null,
  },
];

/** Birleşen eski kimlikler → yeni oyun (+ mod ipucu). */
export const LEGACY_ALIASES: Readonly<Record<string, LegacyAlias>> = {
  'truth-vs-fake': { target: 'fake-hunter', mode: 'kaydir' },
  'review-detective': { target: 'fake-hunter', mode: 'dosya' },
  'word-spot': { target: 'fake-hunter', mode: 'kelime' },
  'bot-hunter': { target: 'fake-hunter', mode: 'profil' },
  'spam-defense': { target: 'core-defense' },
  'troll-slayer': { target: 'core-defense' },
  'guardian-of-trust': { target: 'frost-catcher', mode: 'muhafiz' },
  pacman: { target: 'star-hunt' },
};

const BY_ID = new Map(GAMES.map((g) => [g.id, g]));
const BY_GAME_TYPE = new Map(GAMES.map((g) => [g.gameType, g]));
const RETIRED_BY_ID = new Map(RETIRED_GAMES.map((g) => [g.id, g]));

export function getGameEntry(id: string): GameEntry | undefined {
  return BY_ID.get(id);
}

export function getGameEntryByGameType(gameType: string): GameEntry | undefined {
  return BY_GAME_TYPE.get(gameType);
}

export function getRetiredGame(id: string): RetiredGame | undefined {
  return RETIRED_BY_ID.get(id);
}

/**
 * Portföy tavanına sayılan canlı oyunlar, registry sırasında. İsteğe bağlı (`optIn`, admin
 * açar) oyunlar hariç — onlar için `isPlayable` + etkin yapılandırmanın `enabled`'ı esastır.
 */
export function liveGames(): GameEntry[] {
  return GAMES.filter((g) => g.status === 'live' && g.component !== null && !g.optIn);
}

export function isPlayable(entry: GameEntry | undefined): entry is GameEntry & { component: NonNullable<GameEntry['component']> } {
  return !!entry && entry.status === 'live' && entry.component !== null;
}

export const GAMES_HUB_PATH = '/customer/games';

export function gamePath(id: string, mode?: string): string {
  return mode ? `${GAMES_HUB_PATH}/${id}?mod=${encodeURIComponent(mode)}` : `${GAMES_HUB_PATH}/${id}`;
}

export type GameRouteDecision =
  | { kind: 'play'; entry: GameEntry }
  | { kind: 'redirect'; to: string; permanent: boolean }
  | { kind: 'hub'; reason: 'unknown' | 'building' | 'retired' | 'alias-pending' };

/**
 * Dinamik rota kararı. Saf fonksiyon (test edilir).
 *  - canlı oyun → oyna
 *  - yapım aşamasında → hub (geçici)
 *  - eski kimlik (birleşti) → hedef canlıysa kalıcı yönlendirme (+ mod), değilse hub
 *  - emekli → halef canlıysa kalıcı yönlendirme, değilse hub
 *  - bilinmeyen → hub
 */
export function resolveGameRoute(slug: string): GameRouteDecision {
  const entry = BY_ID.get(slug);
  if (entry) {
    if (isPlayable(entry)) return { kind: 'play', entry };
    return { kind: 'hub', reason: entry.status === 'retired' ? 'retired' : 'building' };
  }
  const alias = LEGACY_ALIASES[slug];
  if (alias) {
    const target = BY_ID.get(alias.target);
    if (isPlayable(target)) return { kind: 'redirect', to: gamePath(target.id, alias.mode), permanent: true };
    return { kind: 'hub', reason: 'alias-pending' };
  }
  const retired = RETIRED_BY_ID.get(slug);
  if (retired) {
    const succ = retired.successor ? BY_ID.get(retired.successor) : undefined;
    if (isPlayable(succ)) return { kind: 'redirect', to: gamePath(succ.id), permanent: true };
    return { kind: 'hub', reason: 'retired' };
  }
  return { kind: 'hub', reason: 'unknown' };
}
