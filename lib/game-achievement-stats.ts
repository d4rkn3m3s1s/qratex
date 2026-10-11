import type { Prisma, PrismaClient } from '@prisma/client';
import type { AchievementStats } from '@/lib/game-achievements';
import { getGameDef } from '@/lib/minigame-config';

type Db = PrismaClient | Prisma.TransactionClient;

function addDays(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Oynanmış (bitmiş) deneme durumları: kazanılan + kaybedilen/yarım bırakılan. */
const PLAYED_STATUSES = ['completed', 'failed', 'abandoned'];

/** Kazanılan günlerden en uzun kesintisiz seri. */
export function longestRun(dayKeys: Iterable<string>): number {
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...new Set(dayKeys)].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }
  return longest;
}

/** Oyun başına en iyi skordan "tavana oran" (%0–100); tanımı bilinmeyen oyun sayılmaz. */
export function bestScorePctOf(rows: ReadonlyArray<{ gameType: string; best: number }>): number {
  let pct = 0;
  for (const r of rows) {
    const def = getGameDef(r.gameType);
    if (!def || def.maxScore <= 0) continue;
    pct = Math.max(pct, Math.min(100, Math.floor((Math.max(0, r.best) / def.maxScore) * 100)));
  }
  return pct;
}

/** Başarım istatistiklerinin ham temeli (3 toplama sorgusunun sonucu). */
export interface AchievementBasis {
  perGame: Array<{ gameType: string; plays: number; best: number }>;
  totalWins: number;
  wonDays: string[];
}

/** Ham temelden istatistik (saf). */
export function statsFromBasis(b: AchievementBasis): AchievementStats {
  return {
    totalWins: b.totalWins,
    distinctGames: b.perGame.filter((g) => g.plays > 0).length,
    bestScore: b.perGame.reduce((m, g) => Math.max(m, g.best), 0),
    bestScorePct: bestScorePctOf(b.perGame),
    totalPlays: b.perGame.reduce((n, g) => n + g.plays, 0),
    streak: longestRun(b.wonDays),
  };
}

/**
 * Temel + az önce kapanan TEK deneme (saf). complete route'u "önce" temelini bir kez yükler,
 * "sonra"yı buradan türetir — eskiden aynı 3 sorgu tamamlama başına iki kez koşuyordu (Y6).
 */
export function withFinishedAttempt(
  b: AchievementBasis,
  a: { gameType: string; status: 'completed' | 'failed'; score: number; dayKey: string }
): AchievementBasis {
  const score = Math.max(0, Math.floor(a.score));
  let found = false;
  const perGame = b.perGame.map((g) => {
    if (g.gameType !== a.gameType) return g;
    found = true;
    return { gameType: g.gameType, plays: g.plays + 1, best: Math.max(g.best, score) };
  });
  if (!found) perGame.push({ gameType: a.gameType, plays: 1, best: score });
  const won = a.status === 'completed';
  return {
    perGame,
    totalWins: b.totalWins + (won && score > 0 ? 1 : 0),
    wonDays: won && !b.wonDays.includes(a.dayKey) ? [...b.wonDays, a.dayKey] : b.wonDays,
  };
}

/** Başarım temelini üç küçük toplama sorgusuyla yükler (tüm geçmiş satırları belleğe çekilmez). */
export async function loadAchievementBasis(db: Db, userId: string): Promise<AchievementBasis> {
  const [groups, totalWins, wonDays] = await Promise.all([
    db.miniGameSession.groupBy({
      by: ['gameType'],
      where: { userId, status: { in: PLAYED_STATUSES } },
      _count: { _all: true },
      _max: { starsCollected: true },
    }),
    db.miniGameSession.count({ where: { userId, status: 'completed', starsCollected: { gt: 0 } } }),
    db.miniGameSession.findMany({
      where: { userId, status: 'completed' },
      select: { dayKey: true },
      distinct: ['dayKey'],
    }),
  ]);
  return {
    perGame: groups.map((g) => ({
      gameType: g.gameType,
      plays: g._count?._all ?? 0,
      best: g._max?.starsCollected ?? 0,
    })),
    totalWins,
    wonDays: wonDays.map((r) => r.dayKey),
  };
}

/**
 * Bir oyuncunun mini oyun başarım istatistiklerini MiniGameSession'dan hesaplar.
 * Hem achievements API'si / Oyna merkezi hem complete route (yeni rozet tespiti) kullanır.
 * "Farklı oyun" = OYNANAN (kazanılan ya da kaybedilen) oyun türü — başarım metni "oyna" der.
 */
export async function computeAchievementStats(db: Db, userId: string): Promise<AchievementStats> {
  return statsFromBasis(await loadAchievementBasis(db, userId));
}
