/**
 * Oyna merkezi (`/customer/games`) — oyun kataloğu ve "bugün" durumu (SAF; DB yok, test edilir).
 *
 * Kaynaklar:
 *  - Portföy: `lib/games/registry` (canlı oyunlar, birleşen eski kimlikler, emekliler).
 *  - Sunucu kuralları + admin override: `lib/minigame-config-effective` (`EffectiveMiniGame`).
 *  - Bugünkü deneme: `MiniGameSession` satırları (günde 1 DENEME; `lib/game-session`).
 *
 * Hub'da görünen oyunlar:
 *  1. Kayıt defterinde CANLI olan oyunlar (registry sırası; admin kapattıysa ya da sunucu
 *     gizlediyse görünmez).
 *  2. Birleşeceği hedef oyun henüz canlı olmayan ESKİ oyunlar (ör. `truth-vs-fake` → Sahte
 *     Avcısı yapım aşamasında). Bunlar bugün hâlâ oynanabilir, sıralıdır ve turnuva
 *     rotasyonundadır; hedef canlıya çıkınca kendiliğinden listeden düşer.
 *  Emekli oyunlar (§7.3) hiçbir koşulda görünmez.
 */
import { addDays as addIstanbulDays, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import {
  GAMES,
  LEGACY_ALIASES,
  RETIRED_GAMES,
  gamePath,
  getGameEntry,
  isPlayable,
  type GameRole,
} from '@/lib/games/registry';

/** Bugünkü sıralı deneme durumu. `unfinished`: başlatılıp bitirilmemiş (deneme harcanmıştır). */
export type TodayState = 'won' | 'lost' | 'unfinished' | 'available';

/** `EffectiveMiniGame` alt kümesi (test kolaylığı). */
export interface EffectiveGameLike {
  gameType: string;
  title: string;
  description: string;
  emoji: string;
  accent: string;
  enabled: boolean;
  hidden?: boolean;
  rewardPoints: number;
  rewardXp: number;
  rewardThreshold: number;
  maxScore: number;
  maxDurationSec?: number;
}

export interface HubGame {
  /** URL kimliği (`/customer/games/<id>`). */
  id: string;
  /** Sunucu anahtarı (MiniGameSession.gameType). */
  gameType: string;
  href: string;
  title: string;
  description: string;
  emoji: string;
  /** Hex vurgu (yalnız dekoratif kenar/hale; metin rengi DEĞİL). */
  accent: string;
  /** `classic` = birleşmeyi bekleyen eski oyun. */
  role: GameRole | 'classic';
  rewardPoints: number;
  rewardXp: number;
  rewardThreshold: number;
  maxScore: number;
  /** Pratik (ödülsüz, sınırsız) modu var mı. */
  practice: boolean;
  /** Birleşeceği yeni oyunun adı (yalnız `classic`). */
  mergesInto: string | null;
}

/** Emekli oyun kimlikleri (registry). */
export const RETIRED_IDS: ReadonlySet<string> = new Set(RETIRED_GAMES.map((g) => g.id));

/**
 * Hub kataloğu: canlı registry oyunları + birleşmeyi bekleyen eski oyunlar.
 * `effective`: gameType → etkin yapılandırma (pacman dahil). Eksikse oyun gösterilmez
 * (sunucu kuralı olmayan oyun oynanamaz).
 */
export function buildHubCatalog(effective: ReadonlyMap<string, EffectiveGameLike>): HubGame[] {
  const out: HubGame[] = [];
  const seen = new Set<string>();

  for (const entry of GAMES) {
    if (!isPlayable(entry)) continue;
    const eff = effective.get(entry.gameType);
    if (!eff || !eff.enabled || eff.hidden) continue;
    if (seen.has(entry.gameType)) continue;
    seen.add(entry.gameType);
    out.push({
      id: entry.id,
      gameType: entry.gameType,
      href: gamePath(entry.id),
      title: eff.title,
      description: eff.description,
      emoji: eff.emoji,
      accent: eff.accent,
      role: entry.role,
      rewardPoints: eff.rewardPoints,
      rewardXp: eff.rewardXp,
      rewardThreshold: eff.rewardThreshold,
      maxScore: eff.maxScore,
      practice: entry.modes.practice,
      mergesInto: null,
    });
  }

  for (const [legacyId, alias] of Object.entries(LEGACY_ALIASES)) {
    if (RETIRED_IDS.has(legacyId)) continue;
    const target = getGameEntry(alias.target);
    // Hedef canlıysa eski kimlik oraya yönlenir; ayrı kart olmaz.
    if (isPlayable(target)) continue;
    const eff = effective.get(legacyId);
    if (!eff || !eff.enabled || eff.hidden) continue;
    if (seen.has(legacyId)) continue;
    seen.add(legacyId);
    out.push({
      id: legacyId,
      gameType: legacyId,
      // Eski statik sayfa bugün hâlâ oynatır (dinamik rota hedef canlı olana dek hub'a döner).
      href: `/customer/games/${legacyId}`,
      title: eff.title,
      description: eff.description,
      emoji: eff.emoji,
      accent: eff.accent,
      role: 'classic',
      rewardPoints: eff.rewardPoints,
      rewardXp: eff.rewardXp,
      rewardThreshold: eff.rewardThreshold,
      maxScore: eff.maxScore,
      practice: false,
      mergesInto: target?.title ?? null,
    });
  }

  return out;
}

/** Bugünkü deneme satırı (MiniGameSession alt kümesi). */
export interface TodayRow {
  gameType: string;
  status: string;
  starsCollected: number;
  rewardPoints: number;
  startedAt: Date;
  serverStartedAt: Date | null;
  expiresAt: Date | null;
}

export interface TodayEntry {
  state: Exclude<TodayState, 'available'>;
  score: number;
  /** Bu denemede kredilenen puan (tavan sonrası). */
  rewardPoints: number;
}

const DEFAULT_WINDOW_SEC = 900;

/**
 * Bugünkü satırları oyun başına duruma çevirir. `active` satır:
 *  - süresi dolduysa `lost` (sunucu bir sonraki start/complete'te `failed`'a çeker);
 *  - dolmadıysa `unfinished` (deneme başlangıçta harcandı; yarım bırakılırsa kayıp sayılır).
 */
export function summarizeToday(
  rows: readonly TodayRow[],
  now: Date,
  windowSecFor: (gameType: string) => number | undefined = () => undefined
): Map<string, TodayEntry> {
  const out = new Map<string, TodayEntry>();
  for (const r of rows) {
    if (r.status === 'completed') {
      out.set(r.gameType, { state: 'won', score: r.starsCollected, rewardPoints: r.rewardPoints });
      continue;
    }
    if (r.status === 'failed' || r.status === 'abandoned') {
      out.set(r.gameType, { state: 'lost', score: r.starsCollected, rewardPoints: 0 });
      continue;
    }
    if (r.status === 'active') {
      const started = r.serverStartedAt ?? r.startedAt;
      const windowSec = windowSecFor(r.gameType) ?? DEFAULT_WINDOW_SEC;
      const expiresAt = r.expiresAt ?? new Date(started.getTime() + windowSec * 1000);
      out.set(r.gameType, {
        state: now.getTime() > expiresAt.getTime() ? 'lost' : 'unfinished',
        score: 0,
        rewardPoints: 0,
      });
    }
  }
  return out;
}

export function todayStateOf(today: ReadonlyMap<string, TodayEntry> | null, gameType: string): TodayState | null {
  if (!today) return null;
  return today.get(gameType)?.state ?? 'available';
}

/** Basit, kararlı dize karması (gün → rotasyon indeksi). */
export function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Öne çıkan oyun ("Sıradaki oyunun"):
 *  1. Haftanın turnuva oyunu bugün denenmediyse o (gerçek ödül havuzu var).
 *  2. Değilse bugün denenmemiş oyunlardan güne göre dönen biri (herkese aynı gün aynı).
 *  3. Hepsi denendiyse null (hub "bugünlük bitti" durumunu gösterir).
 * `today` bilinmiyorsa (sorgu hatası) durum filtresi uygulanmaz.
 */
export function pickFeatured(
  games: readonly HubGame[],
  today: ReadonlyMap<string, TodayEntry> | null,
  opts: { tournamentGameType: string | null; dayKey: string }
): HubGame | null {
  const open = games.filter((g) => {
    const st = todayStateOf(today, g.gameType);
    return st === null || st === 'available';
  });
  if (open.length === 0) return null;
  const t = opts.tournamentGameType ? open.find((g) => g.gameType === opts.tournamentGameType) : undefined;
  if (t) return t;
  return open[stableHash(opts.dayKey) % open.length];
}

// ───────────────────────────── Oyun serisi ─────────────────────────────

function addDayKey(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Her gün +10 XP, her 3. günde +30 XP ek (lib/game-session `streakBonusFor` ile aynı kural). */
export const STREAK_STEP = 3;

export interface StreakSummary {
  current: number;
  longest: number;
  /** Bugün en az bir oyun KAZANILDI mı (seri yalnız kazanılan günlerle sürer). */
  wonToday: boolean;
  /** Dünle süren seri bugün kazanılmazsa kopacak. */
  atRisk: boolean;
  /** Bugün kazanılırsa seri kaç gün olur. */
  nextLength: number;
  /** Bir sonraki 3'ün katı (bonus günü). */
  nextMilestone: number;
}

/** Kazanılan günlerden (oyun gün anahtarları) seri özeti. */
export function streakSummary(wonDays: Iterable<string>, today: string): StreakSummary {
  const days = new Set(wonDays);
  const wonToday = days.has(today);
  const yesterday = addDayKey(today, -1);
  let cursor: string | null = wonToday ? today : days.has(yesterday) ? yesterday : null;
  let current = 0;
  while (cursor && days.has(cursor)) {
    current += 1;
    cursor = addDayKey(cursor, -1);
  }
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...days].sort()) {
    run = prev && addDayKey(prev, 1) === d ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }
  const nextLength = wonToday ? current : current + 1;
  // Bir sonraki bonus günü: mevcut serinin üstündeki ilk 3'ün katı.
  const nextMilestone = (Math.floor(current / STREAK_STEP) + 1) * STREAK_STEP;
  return {
    current,
    longest: Math.max(longest, current),
    wonToday,
    atRisk: !wonToday && current > 0,
    nextLength,
    nextMilestone,
  };
}

/** Seri günü için XP bonusu (lib/game-session `streakBonusFor` ile birebir). */
export function streakBonusXp(length: number): number {
  if (length <= 0) return 0;
  return 10 + (length % STREAK_STEP === 0 ? 30 : 0);
}

/**
 * Sonraki oyun günü sıfırlama anı: bir sonraki Europe/Istanbul gece yarısı
 * (`lib/game-session.gameDayKey` İstanbul takvim günüdür).
 */
export function nextGameDayReset(now: Date): Date {
  return istanbulDayStart(addIstanbulDays(istanbulDay(now), 1));
}
