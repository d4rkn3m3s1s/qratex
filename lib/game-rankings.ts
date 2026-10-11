/**
 * Oyun sıralamaları (sunucu) — liderlik + haftalık turnuva okuması, önbelleği ve turnuva
 * ödülünün TEK kredi yolu.
 *
 * Neden (oyun-ekosistemi Y6 / K4):
 *  - Liderlik (tüm zamanlar groupBy) ve haftalık turnuva sıralaması her açılışta DB'yi
 *    tarıyordu; Oyna merkezi + turnuva sekmesi + oyun kabuğu aynı sıralamayı ayrı ayrı
 *    hesaplıyordu. Artık kısa TTL'li Redis önbelleği; yeni kazanılan deneme ilgili
 *    anahtarları DÜŞÜRÜR (oyuncu sonuç ekranında kendi skorunu bayat görmez). Redis yoksa
 *    doğrudan DB (davranış aynı).
 *  - Turnuva ödülü yalnız oyuncu "geçen hafta" ekranı açınca talep edilebiliyordu; o hafta
 *    uygulamaya girmeyen kazananın ödülü kayboluyordu. Artık günlük iş (`tournament-settle`)
 *    geçen haftanın ilk 3'üne ödülü KENDİSİ kredi eder; talep ucu aynı fonksiyonu çağırır
 *    (tek kural: danışma kilidi + sıra tekilliği + `mintPoints` idempotency).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cachedJson, redisDel } from '@/lib/redis';
import { mintPoints } from '@/lib/economy';
import { isoWeekKey, isoWeekStart, previousIsoWeekKey } from '@/lib/tournament-core';
import { featuredGameForWeek, prizeFor, rankWeekly, type RankedEntry } from '@/lib/game-tournament';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Liderlikte taranan en fazla oyuncu (fazlası "100+"). */
export const LEADERBOARD_WINDOW = 100;

const ALL_TIME_TTL_SEC = 120;
const OPEN_WEEK_TTL_SEC = 60;
/** Kapanmış hafta değişmez (yeni deneme o pencereye düşemez) → uzun TTL. */
const CLOSED_WEEK_TTL_SEC = 30 * 60;

const allTimeKey = (gameType: string) => `game:lb:all:${gameType}`;
const weekKeyOf = (gameType: string, weekKey: string) => `game:lb:week:${gameType}:${weekKey}`;

export interface AllTimeRow {
  userId: string;
  best: number;
}

/**
 * Bir oyunun tüm zamanlar sıralaması: kullanıcı başına en iyi KAZANILMIŞ (sunucu doğrulamalı)
 * skor, ilk `LEADERBOARD_WINDOW + 1` satır (fazlası var mı anlaşılsın).
 */
export async function allTimeTop(gameType: string): Promise<AllTimeRow[]> {
  return cachedJson(allTimeKey(gameType), ALL_TIME_TTL_SEC, async () => {
    const grouped = await prisma.miniGameSession.groupBy({
      by: ['userId'],
      where: { gameType, status: 'completed', starsCollected: { gt: 0 } },
      _max: { starsCollected: true },
      orderBy: { _max: { starsCollected: 'desc' } },
      take: LEADERBOARD_WINDOW + 1,
    });
    return grouped
      .map((g) => ({ userId: g.userId, best: g._max.starsCollected ?? 0 }))
      .filter((r) => r.best > 0);
  });
}

type CachedRanked = { userId: string; best: number; at: number };

/** Haftalık belirli sıralama (`rankWeekly` kuralı) — `from` haftanın Pazartesi'si. */
export async function weeklyRanking(gameType: string, from: Date, now: Date = new Date()): Promise<RankedEntry[]> {
  const to = new Date(from.getTime() + WEEK_MS);
  const wk = isoWeekKey(from);
  const closed = to.getTime() <= now.getTime();
  const rows = await cachedJson<CachedRanked[]>(
    weekKeyOf(gameType, wk),
    closed ? CLOSED_WEEK_TTL_SEC : OPEN_WEEK_TTL_SEC,
    async () => {
      const sessions = await prisma.miniGameSession.findMany({
        where: { gameType, status: 'completed', completedAt: { gte: from, lt: to } },
        select: { userId: true, starsCollected: true, completedAt: true },
      });
      return rankWeekly(sessions).map((r) => ({ userId: r.userId, best: r.best, at: r.achievedAt.getTime() }));
    }
  );
  return rows.map((r) => ({ userId: r.userId, best: r.best, achievedAt: new Date(r.at) }));
}

/** Kazanılan sıralı deneme sonrası: o oyunun liderlik + bu haftanın turnuva önbelleği düşer. */
export async function invalidateGameRankings(gameType: string, now: Date = new Date()): Promise<void> {
  await redisDel(allTimeKey(gameType), weekKeyOf(gameType, isoWeekKey(now)));
}

// ───────────────────────────── Turnuva ödülü ─────────────────────────────

export type PrizeCreditResult =
  | { kind: 'credited'; credited: number }
  | { kind: 'already' }
  | { kind: 'rank_taken' };

/**
 * Bir turnuva sırasının ödülünü atomik kredi eder (tx içinde çağrılır).
 *  - (gameType, weekKey) danışma kilidi → sıra-tekilliği denetimi yarışsız;
 *  - aynı sıra başka kullanıcıya verildiyse `rank_taken`;
 *  - `(userId, gameType, weekKey)` unique → aynı kişi iki kez alamaz (`already`);
 *  - `mintPoints` defter anahtarı `tournament:<oyun>:<hafta>:<kullanıcı>` + bildirim aynı tx'te.
 */
export async function creditTournamentPrize(
  tx: Prisma.TransactionClient,
  p: { userId: string; gameType: string; gameTitle: string; weekKey: string; rank: number; points: number }
): Promise<PrizeCreditResult> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tournament:${p.gameType}:${p.weekKey}`}))`;

  const rankTaken = await tx.tournamentRewardClaim.findFirst({
    where: { gameType: p.gameType, weekKey: p.weekKey, rank: p.rank },
    select: { userId: true },
  });
  if (rankTaken && rankTaken.userId !== p.userId) return { kind: 'rank_taken' };

  const claim = await tx.tournamentRewardClaim.createMany({
    data: [{ userId: p.userId, gameType: p.gameType, weekKey: p.weekKey, rank: p.rank, points: p.points }],
    skipDuplicates: true,
  });
  if (claim.count === 0) return { kind: 'already' };

  const minted = await mintPoints(tx, {
    userId: p.userId,
    points: p.points,
    source: 'tournament',
    sourceId: `${p.gameType}:${p.weekKey}`,
    idempotencyKey: `tournament:${p.gameType}:${p.weekKey}:${p.userId}`,
    capCategory: null,
    meta: { gameType: p.gameType, weekKey: p.weekKey, rank: p.rank },
  });
  await tx.notification.create({
    data: {
      userId: p.userId,
      type: 'success',
      title: '🏆 Turnuva ödülü!',
      message: `${p.gameTitle} haftalık turnuvasında ${p.rank}. oldun ve +${minted.credited} puan kazandın!`,
    },
  });
  return { kind: 'credited', credited: minted.credited };
}

export interface SettleOutcome {
  weekKey: string;
  gameType: string | null;
  participants: number;
  credited: Array<{ rank: number; points: number }>;
  skipped: Array<{ rank: number; reason: 'already' | 'rank_taken' }>;
  /** Katılım eşiği sağlanmadı → ödül yok. */
  belowMinimum: boolean;
}

/**
 * Geçen haftanın öne çıkan turnuvasını kapatır: ilk 3'e ödül (idempotent; tekrar koşu
 * yalnız `already` üretir). Günlük işten çağrılır — Pazartesi kaçarsa ertesi gün telafi.
 */
export async function settlePreviousWeekTournament(
  gameTitleOf: (gameType: string) => Promise<string>,
  now: Date = new Date()
): Promise<SettleOutcome> {
  const weekKey = previousIsoWeekKey(now);
  const gameType = featuredGameForWeek(weekKey);
  const out: SettleOutcome = { weekKey, gameType, participants: 0, credited: [], skipped: [], belowMinimum: false };
  if (!gameType) return out;

  const from = new Date(isoWeekStart(now).getTime() - WEEK_MS);
  const ranked = await weeklyRanking(gameType, from, now);
  out.participants = ranked.length;
  const title = await gameTitleOf(gameType);

  for (let i = 0; i < Math.min(3, ranked.length); i++) {
    const rank = i + 1;
    const points = prizeFor(rank, ranked.length);
    if (points <= 0) {
      out.belowMinimum = true;
      break;
    }
    const r = await prisma.$transaction((tx) =>
      creditTournamentPrize(tx, { userId: ranked[i].userId, gameType, gameTitle: title, weekKey, rank, points })
    );
    if (r.kind === 'credited') out.credited.push({ rank, points: r.credited });
    else out.skipped.push({ rank, reason: r.kind });
  }
  return out;
}
