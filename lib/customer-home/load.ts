/**
 * Müşteri Ana Sayfa verisi — TEK sunucu yükleyicisi.
 *
 * Hem `app/customer/page.tsx` (SSR ilk render) hem `GET /api/customer/home` (BFF) bunu
 * çağırır. Bütün sorgular tek `Promise.all` turunda, dar `select` ile; kullanıcıya özel,
 * önbelleğe alınmaz. Hata FIRLATILIR (çağıran görünür hata gösterir — "200 + sıfırlar" yok).
 *
 * Kapsam: her sorgu `userId = oturum` ile sınırlıdır; sıra sayıları yalnız sayı döndürür
 * (başka kullanıcının kimliği/adı dönmez).
 */
import { prisma } from '@/lib/prisma';
import { getModuleControls } from '@/lib/module-gate';
import { getShellConfig } from '@/lib/navigation/get-shell-config';
import { getLeagueRules } from '@/lib/league-rules';
import { getPointsMatrix, getSpinRules } from '@/lib/points-rules';
import { LOGIN_STREAK_MILESTONES } from '@/lib/login-streak';
import { resolveRewardDisplayImage } from '@/lib/reward-display-image';
import { istanbulDay } from '@/components/ds/page/date-range';
import {
  buildDailyGoals,
  buildPendingActions,
  dailyBoxDayKeys,
  dayKeyToDbDate,
  greetingFor,
  istanbulTodayStart,
  istanbulWeekStart,
  leagueFor,
  leagueSnapshot,
  levelFromXp,
  nextResetAt,
  parseClaimedMilestones,
  pickRewardTargets,
  safeBackgroundUrl,
  streakSnapshot,
  sumCreditedPoints,
} from './core';
import type { CustomerHomeData, HomeSections } from './types';

/** Sıralamaya giren müşteriler: demo/anonim hesaplar sayılmaz. */
const RANKED = { role: 'CUSTOMER' as const, isDemo: false, anonymizedAt: null };

export class CustomerHomeNotFoundError extends Error {
  constructor() {
    super('Kullanıcı bulunamadı');
    this.name = 'CustomerHomeNotFoundError';
  }
}

export async function resolveHomeSections(): Promise<HomeSections> {
  const [controls, shell, matrix] = await Promise.all([getModuleControls(), getShellConfig('customer'), getPointsMatrix()]);
  const enabled = new Set<string>([...shell.palette.map((p) => p.id), ...shell.bottomTabs.map((t) => t.id)]);
  const on = (moduleKey: string) => controls[moduleKey] !== false;
  return {
    rewards: on('rewards') && enabled.has('customer.wallet.rewards'),
    surpriseBoxes: on('surprise_boxes') && enabled.has('customer.wallet.owned'),
    leaderboard: enabled.has('customer.leaderboard'),
    games: enabled.has('customer.games'),
    remedy: on('remedy_offers') && enabled.has('customer.me.voices'),
    spin: getSpinRules(matrix).enabled,
  };
}

export async function loadCustomerHome(userId: string, now: Date = new Date()): Promise<CustomerHomeData> {
  const today = istanbulDay(now);
  const todayStart = istanbulTodayStart(now);
  const weekStart = istanbulWeekStart(now);

  const [user, sections, leagueRules, matrix] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        image: true,
        points: true,
        xp: true,
        customFrameColor: true,
        loginStreakCount: true,
        loginStreakLongest: true,
        loginStreakLastDay: true,
        loginStreakClaimedMilestones: true,
        equippedCosmetics: {
          where: { isEquipped: true },
          select: { cosmetic: { select: { type: true, imageUrl: true } } },
        },
      },
    }),
    resolveHomeSections(),
    getLeagueRules(),
    getPointsMatrix(),
  ]);
  if (!user) throw new CustomerHomeNotFoundError();

  const points = Math.max(0, user.points);
  const sortedRules = [...leagueRules].sort((a, b) => a.minPoints - b.minPoints);
  const { current: league, index: leagueIndex } = leagueFor(points, sortedRules);
  const nextLeagueMin = sortedRules[leagueIndex + 1]?.minPoints ?? null;
  const leagueRange = nextLeagueMin === null ? { gte: league.minPoints } : { gte: league.minPoints, lt: nextLeagueMin };
  const aboveInLeague = nextLeagueMin === null ? { gt: points } : { gt: points, lt: nextLeagueMin };
  const boxKeys = dailyBoxDayKeys(now);
  const spinRules = getSpinRules(matrix);

  const [
    aboveCount,
    leagueSize,
    nextAbove,
    creditedThisWeek,
    rewards,
    pendingReviews,
    unopenedBoxes,
    readyRewards,
    pendingRemedy,
    feedbackToday,
    reviewToday,
    anyFeedback,
    anyReview,
    spinRow,
    boxOpenedToday,
    gameToday,
  ] = await Promise.all([
    prisma.user.count({ where: { ...RANKED, points: aboveInLeague } }),
    prisma.user.count({ where: { ...RANKED, points: leagueRange } }),
    prisma.user.findFirst({ where: { ...RANKED, points: aboveInLeague }, orderBy: { points: 'asc' }, select: { points: true } }),
    prisma.analyticsEvent.findMany({
      where: { userId, event: 'points_credited', createdAt: { gte: weekStart } },
      select: { data: true },
      take: 2000,
    }),
    sections.rewards
      ? prisma.reward.findMany({
          where: { isActive: true, archivedAt: null },
          orderBy: { cost: 'asc' },
          take: 100,
          select: { id: true, name: true, icon: true, cost: true, stock: true, metadata: true },
        })
      : Promise.resolve([]),
    prisma.consumption.count({ where: { customerId: userId, review: null } }),
    sections.surpriseBoxes ? prisma.userSurpriseBox.count({ where: { userId, openedAt: null } }) : Promise.resolve(0),
    sections.rewards ? prisma.userReward.count({ where: { userId, claimedAt: null } }) : Promise.resolve(0),
    sections.remedy ? prisma.remedyOffer.count({ where: { userId, status: 'pending' } }) : Promise.resolve(0),
    prisma.feedback.findFirst({ where: { userId, createdAt: { gte: todayStart } }, select: { id: true } }),
    prisma.consumptionReview.findFirst({ where: { customerId: userId, createdAt: { gte: todayStart } }, select: { id: true } }),
    prisma.feedback.findFirst({ where: { userId }, select: { id: true } }),
    prisma.consumptionReview.findFirst({ where: { customerId: userId }, select: { id: true } }),
    sections.spin
      ? prisma.dailySpin.findUnique({ where: { userId_day: { userId, day: dayKeyToDbDate(today) } }, select: { count: true } })
      : Promise.resolve(null),
    sections.surpriseBoxes
      ? prisma.userSurpriseBox.findFirst({ where: { userId, dayKey: { in: boxKeys }, openedAt: { not: null } }, select: { id: true } })
      : Promise.resolve(null),
    sections.games ? prisma.miniGameSession.findFirst({ where: { userId, startedAt: { gte: todayStart } }, select: { id: true } }) : Promise.resolve(null),
  ]);

  const frame = user.equippedCosmetics.find((c) => c.cosmetic.type === 'avatar_frame')?.cosmetic.imageUrl ?? null;
  const background = user.equippedCosmetics.find((c) => c.cosmetic.type === 'profile_background')?.cosmetic.imageUrl ?? null;

  const streak = streakSnapshot(
    {
      count: user.loginStreakCount,
      longest: user.loginStreakLongest,
      lastDay: user.loginStreakLastDay,
      claimedMilestones: parseClaimedMilestones(user.loginStreakClaimedMilestones),
    },
    now,
    LOGIN_STREAK_MILESTONES
  );

  const rewardTargets = pickRewardTargets(rewards, points, now, (r) =>
    resolveRewardDisplayImage({ id: r.id, icon: r.icon })
  );

  const spinUsed = spinRow?.count ?? 0;

  return {
    now: now.toISOString(),
    today,
    greeting: greetingFor(now),
    isNewCustomer: !anyFeedback && !anyReview,
    profile: {
      name: user.name,
      image: user.image,
      frameId: frame,
      frameColor: user.customFrameColor ?? null,
      backgroundUrl: safeBackgroundUrl(background),
    },
    level: levelFromXp(user.xp),
    wallet: {
      points,
      affordableRewards: rewardTargets.affordable,
      nextReward: rewardTargets.next,
      pointsToNextReward: rewardTargets.pointsToNext,
      weekEarned: sumCreditedPoints(creditedThisWeek),
    },
    streak,
    goals: buildDailyGoals(
      {
        streakCountedToday: streak.countedToday,
        reviewedToday: !!feedbackToday || !!reviewToday,
        spinUsedToday: spinUsed > 0,
        boxOpenedToday: !!boxOpenedToday,
        playedToday: !!gameToday,
      },
      sections
    ),
    pending: buildPendingActions(
      { reviews: pendingReviews, boxes: unopenedBoxes, rewards: readyRewards, remedy: pendingRemedy },
      sections
    ),
    league: leagueSnapshot(points, sortedRules, {
      rankInLeague: aboveCount + 1,
      leagueSize,
      gapToAbove: nextAbove ? Math.max(1, nextAbove.points - points) : null,
    }),
    spin: sections.spin
      ? {
          dailyLimit: spinRules.dailyLimit,
          remaining: Math.max(0, spinRules.dailyLimit - spinUsed),
          prizes: spinRules.prizes.map((p) => ({ id: p.id, label: p.label, type: p.type, value: p.value })),
          resetAt: nextResetAt(now).toISOString(),
        }
      : null,
    surpriseBox: sections.surpriseBoxes ? { openedToday: !!boxOpenedToday, unopened: unopenedBoxes } : null,
    sections,
  };
}
