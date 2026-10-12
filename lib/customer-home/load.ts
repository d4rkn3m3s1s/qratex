/**
 * Müşteri Ana Sayfa verisi — TEK sunucu yükleyicisi.
 *
 * Hem `app/customer/page.tsx` (SSR ilk render) hem `GET /api/customer/home` (BFF) bunu
 * çağırır. Sorgular İKİ `Promise.all` turunda, dar `select` ile; kullanıcıya özel,
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
import { LOGIN_STREAK_MILESTONES, normalizeLoginStreakMilestones } from '@/lib/login-streak';
import { resolveRewardDisplayImage } from '@/lib/reward-display-image';
import { istanbulDay } from '@/components/ds/page/date-range';
import {
  buildDailyGoals,
  buildPendingActions,
  dailyBoxDayKeys,
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

type HomeUserFacts = {
  pendingReviews: number;
  unopenedBoxes: number;
  readyRewards: number;
  pendingRemedy: number;
  feedbackToday: boolean;
  reviewToday: boolean;
  anyFeedback: boolean;
  anyReview: boolean;
  spinCount: number | null;
  boxOpenedToday: boolean;
  gameToday: boolean;
};

/**
 * Kullanıcıya özel 11 sayaç/varlık kontrolü TEK gidiş-dönüşte (perf: lcp-mobile).
 * Önceden 11 ayrı Prisma sorgusuydu; havuz 5 bağlantı olduğundan ~3 dalga × DB RTT ekliyordu
 * (yerelde ölçülen RTT ≈ 290 ms → panonun LCP'si ~2,6 sn sunucu beklemesiydi). Koşullar
 * Prisma sürümüyle birebir aynı; bölüm kapalıysa değer çağıranda sıfırlanır.
 */
async function loadUserFacts(userId: string, todayStart: Date, today: string, boxKeys: string[]): Promise<HomeUserFacts> {
  const rows = await prisma.$queryRaw<HomeUserFacts[]>`
    SELECT
      (SELECT count(*)::int FROM "Consumption" c WHERE c."customerId" = ${userId}
         AND NOT EXISTS (SELECT 1 FROM "ConsumptionReview" r WHERE r."consumptionId" = c."id")) AS "pendingReviews",
      (SELECT count(*)::int FROM "UserSurpriseBox" WHERE "userId" = ${userId} AND "openedAt" IS NULL AND "withdrawnAt" IS NULL) AS "unopenedBoxes",
      (SELECT count(*)::int FROM "UserReward" WHERE "userId" = ${userId} AND "claimedAt" IS NULL) AS "readyRewards",
      (SELECT count(*)::int FROM "RemedyOffer" WHERE "userId" = ${userId} AND "status" = 'pending') AS "pendingRemedy",
      EXISTS (SELECT 1 FROM "Feedback" WHERE "deletedAt" IS NULL AND "userId" = ${userId} AND "createdAt" >= ${todayStart}) AS "feedbackToday",
      EXISTS (SELECT 1 FROM "ConsumptionReview" WHERE "deletedAt" IS NULL AND "customerId" = ${userId} AND "createdAt" >= ${todayStart}) AS "reviewToday",
      EXISTS (SELECT 1 FROM "Feedback" WHERE "deletedAt" IS NULL AND "userId" = ${userId}) AS "anyFeedback",
      EXISTS (SELECT 1 FROM "ConsumptionReview" WHERE "deletedAt" IS NULL AND "customerId" = ${userId}) AS "anyReview",
      (SELECT "count" FROM "DailySpin" WHERE "userId" = ${userId} AND "day" = ${today}::date) AS "spinCount",
      EXISTS (SELECT 1 FROM "UserSurpriseBox" WHERE "userId" = ${userId} AND "dayKey" = ANY(${boxKeys}) AND "openedAt" IS NOT NULL) AS "boxOpenedToday",
      EXISTS (SELECT 1 FROM "MiniGameSession" WHERE "userId" = ${userId} AND "startedAt" >= ${todayStart}) AS "gameToday"
  `;
  const r = rows[0];
  if (!r) throw new Error('Ana sayfa sayaçları okunamadı');
  return r;
}

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

  const boxKeys = dailyBoxDayKeys(now);
  // 1. tur: kullanıcı + kullanıcıya özel sayaçlar (puandan bağımsız olan her şey) birlikte.
  const [user, sections, leagueRules, matrix, creditedThisWeek, facts] = await Promise.all([
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
    prisma.analyticsEvent.findMany({
      where: { userId, event: 'points_credited', createdAt: { gte: weekStart } },
      select: { data: true },
      take: 2000,
    }),
    loadUserFacts(userId, todayStart, today, boxKeys),
  ]);
  if (!user) throw new CustomerHomeNotFoundError();

  const points = Math.max(0, user.points);
  // Seri kilometre taşları puan matrisinden — ödeyen `touchLoginStreak` ile aynı liste.
  const liveMilestones = Array.isArray(matrix?.streak?.milestones) ? normalizeLoginStreakMilestones(matrix.streak.milestones) : [];
  const streakMilestones = liveMilestones.length > 0 ? liveMilestones : LOGIN_STREAK_MILESTONES;
  const sortedRules = [...leagueRules].sort((a, b) => a.minPoints - b.minPoints);
  const { current: league, index: leagueIndex } = leagueFor(points, sortedRules);
  const nextLeagueMin = sortedRules[leagueIndex + 1]?.minPoints ?? null;
  const leagueRange = nextLeagueMin === null ? { gte: league.minPoints } : { gte: league.minPoints, lt: nextLeagueMin };
  const aboveInLeague = nextLeagueMin === null ? { gt: points } : { gt: points, lt: nextLeagueMin };
  const spinRules = getSpinRules(matrix);

  // 2. tur: yalnız puana / bölüme bağlı olanlar.
  const [aboveCount, leagueSize, nextAbove, rewards] = await Promise.all([
    prisma.user.count({ where: { ...RANKED, points: aboveInLeague } }),
    prisma.user.count({ where: { ...RANKED, points: leagueRange } }),
    prisma.user.findFirst({ where: { ...RANKED, points: aboveInLeague }, orderBy: { points: 'asc' }, select: { points: true } }),
    sections.rewards
      ? prisma.reward.findMany({
          where: { isActive: true, archivedAt: null },
          orderBy: { cost: 'asc' },
          take: 100,
          select: { id: true, name: true, icon: true, cost: true, stock: true, metadata: true },
        })
      : Promise.resolve([]),
  ]);
  const pendingReviews = facts.pendingReviews;
  const unopenedBoxes = sections.surpriseBoxes ? facts.unopenedBoxes : 0;
  const readyRewards = sections.rewards ? facts.readyRewards : 0;
  const pendingRemedy = sections.remedy ? facts.pendingRemedy : 0;
  const { feedbackToday, reviewToday, anyFeedback, anyReview } = facts;
  const spinRow = sections.spin && facts.spinCount !== null ? { count: facts.spinCount } : null;
  const boxOpenedToday = sections.surpriseBoxes && facts.boxOpenedToday;
  const gameToday = sections.games && facts.gameToday;

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
    streakMilestones
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
