/**
 * Ben → İlerleme özeti (sunucu). Sayfa sunucu bileşeni bunu doğrudan çağırır; istemciye
 * ek istek yok (yol haritası ilke 11).
 *
 * Kurallar:
 *  - Her bölüm bağımsız: biri çökerse `partial[]` ile işaretlenir, UI "şu an hesaplanamadı"
 *    der. Asla "200 + sıfırlar" yok (eski stats ucu kart sorgusu hatasında 0 basıyordu).
 *  - Sayımlar `count()` ile (eski uçlar `take: 10`/`take: 100` ile kesiyordu).
 *  - Seviye eğrisi `../level` (geometrik, yazan akışla aynı); seri İstanbul günü.
 *  - Puan geçmişi YALNIZ defterden (`PointsLedger`); GET'te LLM yok.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { addDays, istanbulDay } from '@/components/ds/page/date-range';
import { LOGIN_STREAK_MILESTONES, getLoginStreakMilestones, type LoginStreakMilestone } from '@/lib/login-streak';
import { getLeagueRules, getLeagueMetaFromRules, getNextLeagueMetaFromRules } from '@/lib/league-rules';
import { daysToNextLevel, levelProgress, upcomingLevels } from '../level';
import {
  CONTRIBUTION_WEEKS,
  CONTRIBUTION_WINDOW_DAYS,
  contributionHistory,
  contributionLookbackDays,
  contributionScore,
  type ReviewSignal,
} from '../contribution';
import { badgeColor, badgeVisual } from '../badge-visual';
import type { PartialKey, ProgressSummary, StreakState } from '../types';

const DAY_MS = 86_400_000;
const VELOCITY_WINDOW_DAYS = 30;
const HISTORY_WEEKS = 8;

export class ProgressUserNotFoundError extends Error {
  constructor() {
    super('Kullanıcı bulunamadı');
    this.name = 'ProgressUserNotFoundError';
  }
}

/** Bir bölümü güvenle çalıştırır; hata → `null` + partial işareti (sessiz yutma yok, loglanır). */
async function section<T>(key: PartialKey, partial: PartialKey[], run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`[me-progress] bölüm hesaplanamadı: ${key}`, error);
    partial.push(key);
    return null;
  }
}

function parseClaimed(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => Number(v)).filter((v) => Number.isFinite(v));
}

/** Giriş serisinin İstanbul gününe göre durumu (saf). */
export function streakStateOf(
  lastDay: Date | null,
  count: number,
  longest: number,
  claimedRaw: unknown,
  now: Date,
  /** Canlı kilometre taşları (puan matrisi); verilmezse varsayılan liste. */
  milestones: ReadonlyArray<LoginStreakMilestone> = LOGIN_STREAK_MILESTONES,
): ProgressSummary['streak'] {
  const today = istanbulDay(now);
  let state: StreakState = 'none';
  let current = 0;
  if (lastDay) {
    const last = istanbulDay(lastDay);
    if (last === today) {
      state = 'today';
      current = Math.max(0, count);
    } else if (last === addDays(today, -1)) {
      state = 'at_risk';
      current = Math.max(0, count);
    } else {
      state = 'broken';
      current = 0;
    }
  }
  const claimed = parseClaimed(claimedRaw);
  const m = milestones.find((x) => x.days > current && !claimed.includes(x.days)) ?? null;
  return {
    state,
    current,
    longest: Math.max(longest, current),
    nextMilestone: m ? { days: m.days, points: m.points, remaining: m.days - current } : null,
  };
}

type ReviewRow = { at: Date; len: number | bigint | null; flagged: boolean | null; replied: Date | null };

export async function loadReviewSignals(userId: string, since: Date): Promise<ReviewSignal[]> {
  const rows = await prisma.$queryRaw<ReviewRow[]>(Prisma.sql`
    SELECT "createdAt" AS at,
           char_length(coalesce("text", '')) AS len,
           ("isToxic" OR "trustFlagged") AS flagged,
           "dealerRepliedAt" AS replied
      FROM "Feedback"
     WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "createdAt" >= ${since}
    UNION ALL
    SELECT "createdAt" AS at,
           char_length(coalesce("text", '')) AS len,
           false AS flagged,
           "dealerRepliedAt" AS replied
      FROM "ConsumptionReview"
     WHERE "customerId" = ${userId} AND "deletedAt" IS NULL AND "createdAt" >= ${since}
     LIMIT 5000
  `);
  return rows.map((r) => ({
    at: new Date(r.at),
    textLength: Number(r.len ?? 0),
    flagged: r.flagged === true,
    repliedAt: r.replied ? new Date(r.replied) : null,
  }));
}

export type SummaryOptions = {
  /** `journey_score` modülü açık mı (katkı skoru bölümü). */
  contributionEnabled: boolean;
  now?: Date;
};

export async function getProgressSummary(userId: string, opts: SummaryOptions): Promise<ProgressSummary> {
  const now = opts.now ?? new Date();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      points: true,
      level: true,
      xp: true,
      createdAt: true,
      loginStreakCount: true,
      loginStreakLongest: true,
      loginStreakLastDay: true,
      loginStreakClaimedMilestones: true,
    },
  });
  if (!user) throw new ProgressUserNotFoundError();

  const partial: PartialKey[] = [];
  const level = levelProgress(user.xp, user.level);
  const balance = Math.max(0, user.points);
  const rewardStock = { OR: [{ stock: -1 }, { stock: { gt: 0 } }] };

  const [rewards, league, badges, pendingReviews, xpLast30, contribution, streakMilestones] = await Promise.all([
    section('rewards', partial, async () => {
      const [next, affordableCount] = await Promise.all([
        prisma.reward.findFirst({
          where: { isActive: true, archivedAt: null, cost: { gt: balance }, ...rewardStock },
          orderBy: [{ cost: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, name: true, cost: true },
        }),
        prisma.reward.count({ where: { isActive: true, archivedAt: null, cost: { lte: balance }, ...rewardStock } }),
      ]);
      return { next, affordableCount };
    }),
    section('league', partial, async () => {
      const rules = await getLeagueRules(prisma);
      const cur = getLeagueMetaFromRules(balance, rules);
      const nxt = getNextLeagueMetaFromRules(balance, rules);
      return {
        key: cur.key,
        name: cur.name,
        next: nxt ? { key: nxt.key, name: nxt.name, minPoints: nxt.minPoints, remaining: Math.max(0, nxt.minPoints - balance) } : null,
      };
    }),
    section('badges', partial, async () => {
      const [total, recent] = await Promise.all([
        prisma.userBadge.count({ where: { userId } }),
        prisma.userBadge.findMany({
          where: { userId },
          orderBy: { earnedAt: 'desc' },
          take: 6,
          select: { earnedAt: true, badge: { select: { id: true, name: true, icon: true, rarity: true, color: true } } },
        }),
      ]);
      return {
        total,
        recent: recent.map((ub) => {
          const v = badgeVisual(ub.badge.icon);
          return {
            id: ub.badge.id,
            name: ub.badge.name,
            imageSrc: v.imageSrc,
            emoji: v.emoji,
            rarity: (ub.badge.rarity || 'common').toLowerCase(),
            color: badgeColor(ub.badge.color),
            earnedAt: ub.earnedAt.toISOString(),
          };
        }),
      };
    }),
    section('pending', partial, () => prisma.consumption.count({ where: { customerId: userId, review: null } })),
    section('velocity', partial, async () => {
      const agg = await prisma.pointsLedger.aggregate({
        _sum: { xpDelta: true },
        where: {
          userId,
          status: 'posted',
          xpDelta: { gt: 0 },
          createdAt: { gte: new Date(now.getTime() - VELOCITY_WINDOW_DAYS * DAY_MS) },
        },
      });
      return agg._sum.xpDelta ?? 0;
    }),
    opts.contributionEnabled
      ? section('contribution', partial, async () => {
          const signals = await loadReviewSignals(userId, new Date(now.getTime() - contributionLookbackDays(HISTORY_WEEKS) * DAY_MS));
          const result = contributionScore(signals, now);
          const history = contributionHistory(signals, now, HISTORY_WEEKS);
          const weekAgo = history.length >= 2 ? history[history.length - 2] : result.score;
          return {
            ...result,
            weeklyChange: result.score - weekAgo,
            history,
            window: { days: CONTRIBUTION_WINDOW_DAYS, weeks: CONTRIBUTION_WEEKS },
          };
        })
      : Promise.resolve(null),
    getLoginStreakMilestones(),
  ]);

  return {
    asOf: now.toISOString(),
    memberSince: user.createdAt.toISOString(),
    level,
    upcoming: upcomingLevels(level, 3),
    xpLast30: xpLast30,
    daysToNextLevel: xpLast30 == null ? null : daysToNextLevel(level.xpToNext, xpLast30, VELOCITY_WINDOW_DAYS),
    points: {
      balance,
      nextReward: rewards?.next
        ? { id: rewards.next.id, name: rewards.next.name, cost: rewards.next.cost, remaining: Math.max(0, rewards.next.cost - balance) }
        : null,
      affordableCount: rewards?.affordableCount ?? 0,
    },
    league,
    streak: streakStateOf(
      user.loginStreakLastDay,
      user.loginStreakCount,
      user.loginStreakLongest,
      user.loginStreakClaimedMilestones,
      now,
      streakMilestones,
    ),
    badges: badges ?? { total: 0, recent: [] },
    pendingReviews,
    contribution,
    partial,
  };
}
