/**
 * Oyna merkezi (`/customer/games`) sunucu veri katmanı — RSC sayfası doğrudan çağırır
 * (istemci şelalesi yok, yol haritası §4.4/11).
 *
 * Her bölüm `Settled<T>` döner: bir sorgu düşerse YALNIZ o bölüm hata durumunu gösterir,
 * diğerleri çalışır; hiçbir bölüm hatayı "0" ile örtmez (§4.4/9 — "200 + sıfırlar" yasak).
 *
 * Kapsam: tüm sorgular oturumdaki `userId` ile; dışarıdan kimlik alınmaz. Turnuva sıralaması
 * yalnız kısaltılmış ad ("Ayşe K.") ve skor gösterir.
 */
import { isPrismaConnectivityError, prisma } from '@/lib/prisma';
import { PACMAN_GAME } from '@/lib/minigame-config';
import { getEffectiveMiniGame, getEffectiveMiniGames, type EffectiveMiniGame } from '@/lib/minigame-config-effective';
import { gameDayKey } from '@/lib/game-session';
import { computeAchievementStats } from '@/lib/game-achievement-stats';
import { evaluateAchievements, type AchievementProgress } from '@/lib/game-achievements';
import { GAME_DAILY_CAP, GAME_WEEKLY_CAP, getCapRule, sumEarnedInWindow } from '@/lib/economy/caps';
import {
  isoWeekEnd,
  isoWeekKey,
  isoWeekStart,
  previousIsoWeekKey,
  prizeForRank,
  TOURNAMENT_PRIZES,
} from '@/lib/tournament-core';
import { TOURNAMENT_MIN_PARTICIPANTS, featuredGameForWeek, prizeFor } from '@/lib/game-tournament';
import { weeklyRanking } from '@/lib/game-rankings';
import { leaderboardHiddenUserIds, leaderboardIdentity } from '@/lib/privacy/leaderboard-optout';
import {
  buildHubCatalog,
  nextGameDayReset,
  pickFeatured,
  streakSummary,
  summarizeToday,
  type EffectiveGameLike,
  type HubGame,
  type StreakSummary,
  type TodayEntry,
} from './catalog';
import { GAME_QUEST_IDS, questCounts, questIdempotencyKey, questIdFromKey, questProgress, type QuestProgress } from './quests';
import { PASS_XP_SOURCES, currentPassSeason, passProgress, type PassProgress, type PassSeason } from './pass';

export type Settled<T> = { ok: true; data: T } | { ok: false; error: 'unavailable' | 'failed' };

export async function settle<T>(label: string, p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    console.error('[PLAY_HUB]', label, e);
    return { ok: false, error: isPrismaConnectivityError(e) ? 'unavailable' : 'failed' };
  }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STREAK_WINDOW_DAYS = 120;

// ───────────────────────────── Katalog ─────────────────────────────

/** Etkin yapılandırmalar (registry oyunları + pacman). DB yoksa registry varsayılanı (yardımcılar yutar). */
export async function loadEffectiveMap(): Promise<Map<string, EffectiveMiniGame>> {
  const [games, pacman] = await Promise.all([getEffectiveMiniGames(), getEffectiveMiniGame(PACMAN_GAME.gameType)]);
  const map = new Map<string, EffectiveMiniGame>(games.map((g) => [g.gameType, g]));
  if (pacman) map.set(pacman.gameType, pacman);
  return map;
}

// ───────────────────────────── Turnuva ─────────────────────────────

/** "Mehmet Yılmaz" → "Mehmet Y." (turnuva API'si ile aynı gizlilik kuralı). */
export function shortName(name: string | null): string {
  if (!name) return 'Oyuncu';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export interface TournamentRow {
  rank: number;
  name: string;
  score: number;
  prize: number;
  isMe: boolean;
}

export interface TournamentSummary {
  weekKey: string;
  endsAt: string;
  featured: {
    gameType: string;
    title: string;
    emoji: string;
    accent: string;
    /** Hub'da oynanabilir kart (href) — yoksa null (portföy değişikliği). */
    href: string | null;
  } | null;
  me: { rank: number; score: number } | null;
  totalPlayers: number;
  minParticipants: number;
  participantsNeeded: number;
  prizesActive: boolean;
  prizes: { rank: number; points: number }[];
  leaderboard: TournamentRow[];
  pendingReward: { rank: number; points: number; weekKey: string; gameTitle: string } | null;
}

/** Haftalık tek öne çıkan oyun turnuvası (GET /api/customer/tournament ile aynı kurallar). */
export async function loadTournament(
  userId: string,
  now: Date,
  catalog: readonly HubGame[],
  effective: ReadonlyMap<string, EffectiveGameLike>,
  topN = 10
): Promise<TournamentSummary> {
  const weekKey = isoWeekKey(now);
  // Haftaya dondurulmuş rotasyon takvimi (yalnız canlı oyunlar; gizle/aç rotasyonu kaydırmaz).
  const featuredType = featuredGameForWeek(weekKey);
  const weekStart = isoWeekStart(now);

  const prevWeekKey = previousIsoWeekKey(now);
  const prevFeatured = featuredGameForWeek(prevWeekKey);

  const [ranked, prevRanked] = await Promise.all([
    featuredType ? weeklyRanking(featuredType, weekStart, now) : Promise.resolve([]),
    prevFeatured ? weeklyRanking(prevFeatured, new Date(weekStart.getTime() - WEEK_MS), now) : Promise.resolve([]),
  ]);

  const top = ranked.slice(0, topN);
  const [users, hiddenIds] = top.length
    ? await Promise.all([
        prisma.user.findMany({ where: { id: { in: top.map((r) => r.userId) } }, select: { id: true, name: true } }),
        // "Liderlikte görün" kapalıysa başkalarına anonim (turnuva API'si ile aynı kural).
        leaderboardHiddenUserIds(top.map((r) => r.userId)),
      ])
    : ([[], new Set<string>()] as const);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const leaderboard: TournamentRow[] = top.map((r, i) => {
    const isMe = r.userId === userId;
    const identity = leaderboardIdentity(
      { name: shortName(names.get(r.userId) ?? null) },
      { hidden: hiddenIds.has(r.userId), isViewer: isMe }
    );
    return { rank: i + 1, name: identity.name, score: r.best, prize: prizeForRank(i + 1), isMe };
  });
  const myIndex = ranked.findIndex((r) => r.userId === userId);

  let pendingReward: TournamentSummary['pendingReward'] = null;
  if (prevFeatured) {
    const idx = prevRanked.findIndex((r) => r.userId === userId);
    const points = idx >= 0 ? prizeFor(idx + 1, prevRanked.length) : 0;
    if (points > 0) {
      const claimed = await prisma.tournamentRewardClaim.findUnique({
        where: { userId_gameType_weekKey: { userId, gameType: prevFeatured, weekKey: prevWeekKey } },
        select: { id: true },
      });
      if (!claimed) {
        pendingReward = {
          rank: idx + 1,
          points,
          weekKey: prevWeekKey,
          gameTitle: effective.get(prevFeatured)?.title ?? prevFeatured,
        };
      }
    }
  }

  const eff = featuredType ? effective.get(featuredType) : undefined;
  const card = featuredType ? catalog.find((g) => g.gameType === featuredType) : undefined;
  const prizesActive = ranked.length >= TOURNAMENT_MIN_PARTICIPANTS;

  return {
    weekKey,
    endsAt: isoWeekEnd(now).toISOString(),
    featured: featuredType
      ? {
          gameType: featuredType,
          title: eff?.title ?? featuredType,
          emoji: eff?.emoji ?? '🏆',
          accent: eff?.accent ?? '#7c3aed',
          href: card?.href ?? null,
        }
      : null,
    me: myIndex >= 0 ? { rank: myIndex + 1, score: ranked[myIndex].best } : null,
    totalPlayers: ranked.length,
    minParticipants: TOURNAMENT_MIN_PARTICIPANTS,
    participantsNeeded: Math.max(0, TOURNAMENT_MIN_PARTICIPANTS - ranked.length),
    prizesActive,
    prizes: Object.entries(TOURNAMENT_PRIZES)
      .map(([rank, points]) => ({ rank: Number(rank), points }))
      .sort((a, b) => a.rank - b.rank),
    leaderboard,
    pendingReward,
  };
}

// ───────────────────────────── Oyunlar sekmesi ─────────────────────────────

export interface TodayData {
  dayKey: string;
  resetAt: string;
  entries: Map<string, TodayEntry>;
  quests: QuestProgress[];
}

export interface EarningsData {
  today: number;
  week: number;
  dailyCap: number;
  weeklyCap: number;
}

export interface PassData {
  season: PassSeason;
  progress: PassProgress;
}

export interface AchievementsData {
  list: AchievementProgress[];
  unlocked: number;
  total: number;
}

export interface GamesTabData {
  catalog: HubGame[];
  today: Settled<TodayData>;
  bests: Settled<Map<string, number>>;
  streak: Settled<StreakSummary>;
  earnings: Settled<EarningsData>;
  pass: Settled<PassData>;
  achievements: Settled<AchievementsData>;
  tournament: Settled<TournamentSummary>;
  featured: HubGame | null;
}

async function loadToday(userId: string, now: Date, effective: ReadonlyMap<string, EffectiveGameLike>): Promise<TodayData> {
  const dayKey = gameDayKey(now);
  const keys = GAME_QUEST_IDS.map((id) => questIdempotencyKey(userId, dayKey, id));
  const [rows, claimedRows] = await Promise.all([
    prisma.miniGameSession.findMany({
      where: { userId, dayKey },
      select: {
        gameType: true,
        status: true,
        starsCollected: true,
        rewardPoints: true,
        startedAt: true,
        serverStartedAt: true,
        expiresAt: true,
      },
    }),
    prisma.pointsLedger.findMany({
      where: { userId, idempotencyKey: { in: keys } },
      select: { idempotencyKey: true },
    }),
  ]);
  const entries = summarizeToday(rows, now, (g) => effective.get(g)?.maxDurationSec);
  const claimed = new Set(
    claimedRows.map((r) => (r.idempotencyKey ? questIdFromKey(r.idempotencyKey) : null)).filter((x): x is string => !!x)
  );
  return {
    dayKey,
    resetAt: nextGameDayReset(now).toISOString(),
    entries,
    quests: questProgress(questCounts(rows), claimed),
  };
}

async function loadBests(userId: string): Promise<Map<string, number>> {
  const groups = await prisma.miniGameSession.groupBy({
    by: ['gameType'],
    where: { userId, status: { in: ['completed', 'failed', 'abandoned'] } },
    _max: { starsCollected: true },
  });
  return new Map(groups.map((g) => [g.gameType, g._max?.starsCollected ?? 0]));
}

async function loadStreak(userId: string, now: Date): Promise<StreakSummary> {
  const since = new Date(now.getTime() - STREAK_WINDOW_DAYS * 86_400_000);
  const rows = await prisma.miniGameSession.findMany({
    where: { userId, status: 'completed', completedAt: { gte: since } },
    select: { dayKey: true },
    distinct: ['dayKey'],
  });
  return streakSummary(
    rows.map((r) => r.dayKey),
    gameDayKey(now)
  );
}

async function loadEarnings(userId: string, now: Date): Promise<EarningsData> {
  const rule = getCapRule('game');
  if (!rule) throw new Error('game cap rule missing');
  const sum = await sumEarnedInWindow(prisma, { userId, rule, now });
  return { today: sum.today, week: sum.week, dailyCap: GAME_DAILY_CAP, weeklyCap: GAME_WEEKLY_CAP };
}

async function loadPass(userId: string, now: Date): Promise<PassData> {
  const season = currentPassSeason(now);
  const agg = await prisma.pointsLedger.aggregate({
    _sum: { xpDelta: true },
    where: {
      userId,
      source: { in: [...PASS_XP_SOURCES] },
      status: 'posted',
      createdAt: { gte: season.start, lt: season.end },
    },
  });
  return { season, progress: passProgress(agg._sum?.xpDelta ?? 0) };
}

async function loadAchievements(userId: string): Promise<AchievementsData> {
  const list = evaluateAchievements(await computeAchievementStats(prisma, userId));
  return { list, unlocked: list.filter((a) => a.unlocked).length, total: list.length };
}

export async function loadGamesTab(userId: string, now: Date = new Date()): Promise<GamesTabData> {
  const effective = await loadEffectiveMap();
  const catalog = buildHubCatalog(effective);

  const [today, bests, streak, earnings, pass, achievements, tournament] = await Promise.all([
    settle('today', loadToday(userId, now, effective)),
    settle('bests', loadBests(userId)),
    settle('streak', loadStreak(userId, now)),
    settle('earnings', loadEarnings(userId, now)),
    settle('pass', loadPass(userId, now)),
    settle('achievements', loadAchievements(userId)),
    settle('tournament', loadTournament(userId, now, catalog, effective, 3)),
  ]);

  const featured = pickFeatured(catalog, today.ok ? today.data.entries : null, {
    tournamentGameType: tournament.ok ? tournament.data.featured?.gameType ?? null : null,
    dayKey: gameDayKey(now),
  });

  return { catalog, today, bests, streak, earnings, pass, achievements, tournament, featured };
}

// ───────────────────────────── Turnuva sekmesi ─────────────────────────────

export interface MyWeekRow {
  gameType: string;
  title: string;
  emoji: string;
  best: number;
  href: string | null;
}

export interface TournamentTabData {
  tournament: Settled<TournamentSummary>;
  myWeek: Settled<MyWeekRow[]>;
}

async function loadMyWeek(
  userId: string,
  now: Date,
  catalog: readonly HubGame[],
  effective: ReadonlyMap<string, EffectiveGameLike>
): Promise<MyWeekRow[]> {
  const groups = await prisma.miniGameSession.groupBy({
    by: ['gameType'],
    where: { userId, status: 'completed', completedAt: { gte: isoWeekStart(now), lt: isoWeekEnd(now) } },
    _max: { starsCollected: true },
  });
  return groups
    .map((g) => {
      const eff = effective.get(g.gameType);
      return {
        gameType: g.gameType,
        title: eff?.title ?? g.gameType,
        emoji: eff?.emoji ?? '🎮',
        best: g._max?.starsCollected ?? 0,
        href: catalog.find((c) => c.gameType === g.gameType)?.href ?? null,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'));
}

export async function loadTournamentTab(userId: string, now: Date = new Date()): Promise<TournamentTabData> {
  const effective = await loadEffectiveMap();
  const catalog = buildHubCatalog(effective);
  const [tournament, myWeek] = await Promise.all([
    settle('tournament', loadTournament(userId, now, catalog, effective, 10)),
    settle('my-week', loadMyWeek(userId, now, catalog, effective)),
  ]);
  return { tournament, myWeek };
}
