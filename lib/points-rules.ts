import { prisma } from '@/lib/prisma';

export const POINTS_MATRIX_SETTING_KEY = 'points_matrix';
export const POINTS_MATRIX_SETTING_CATEGORY = 'gamification';

export type RewardGrant = {
  points: number;
  xp: number;
};

export type SpinPrizeType = 'points' | 'xp' | 'nothing';

export type SpinPrizeRule = {
  id: string;
  label: string;
  type: SpinPrizeType;
  value: number;
  weight: number;
};

export type PointsMatrix = {
  feedback: {
    longTextThreshold: number;
    base: RewardGrant;
    detailed: RewardGrant;
  };
  consumptionReview: {
    longTextThreshold: number;
    base: RewardGrant;
    detailed: RewardGrant;
  };
  referral: {
    referredPoints: number;
    referrerPoints: number;
  };
  birthday: {
    points: number;
  };
  streak: {
    milestones: Array<{ days: number; points: number }>;
  };
  quest: {
    default: RewardGrant;
  };
  spin: {
    enabled: boolean;
    dailyLimit: number;
    prizes: SpinPrizeRule[];
  };
};

const DEFAULT_POINTS_MATRIX: PointsMatrix = {
  feedback: {
    longTextThreshold: 50,
    base: { points: 50, xp: 25 },
    detailed: { points: 100, xp: 50 },
  },
  consumptionReview: {
    longTextThreshold: 50,
    base: { points: 50, xp: 25 },
    detailed: { points: 100, xp: 50 },
  },
  referral: {
    referredPoints: 500,
    referrerPoints: 1000,
  },
  birthday: {
    points: 500,
  },
  streak: {
    milestones: [
      { days: 7, points: 100 },
      { days: 14, points: 250 },
      { days: 30, points: 500 },
      { days: 60, points: 1000 },
      { days: 90, points: 2000 },
      { days: 180, points: 5000 },
      { days: 365, points: 10000 },
    ],
  },
  quest: {
    default: { points: 100, xp: 50 },
  },
  spin: {
    enabled: true,
    dailyLimit: 1,
    prizes: [
      { id: 'spin_p_10', label: '10 Puan', type: 'points', value: 10, weight: 25 },
      { id: 'spin_p_25', label: '25 Puan', type: 'points', value: 25, weight: 20 },
      { id: 'spin_p_50', label: '50 Puan', type: 'points', value: 50, weight: 15 },
      { id: 'spin_p_100', label: '100 Puan', type: 'points', value: 100, weight: 10 },
      { id: 'spin_x_20', label: '20 XP', type: 'xp', value: 20, weight: 15 },
      { id: 'spin_x_50', label: '50 XP', type: 'xp', value: 50, weight: 8 },
      { id: 'spin_n_0', label: 'Tekrar Dene', type: 'nothing', value: 0, weight: 7 },
    ],
  },
};

type SettingsReader = {
  settings: {
    findUnique: (args: {
      where: { key: string };
      select: { value: true };
    }) => Promise<{ value: unknown } | null>;
  };
};

function toNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function readRewardGrant(value: unknown, fallback: RewardGrant): RewardGrant {
  if (!value || typeof value !== 'object') return fallback;
  const payload = value as Record<string, unknown>;
  return {
    points: toNonNegativeInt(payload.points, fallback.points),
    xp: toNonNegativeInt(payload.xp, fallback.xp),
  };
}

function normalizeSpinPrize(value: unknown, fallback: SpinPrizeRule, index: number): SpinPrizeRule {
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Record<string, unknown>;
  const type = raw.type;
  const normalizedType: SpinPrizeType =
    type === 'points' || type === 'xp' || type === 'nothing' ? type : fallback.type;
  const parsedValue = toNonNegativeInt(raw.value, fallback.value);

  return {
    id:
      typeof raw.id === 'string' && raw.id.trim().length > 0
        ? raw.id.trim()
        : `${normalizedType}_${index + 1}`,
    label:
      typeof raw.label === 'string' && raw.label.trim().length > 0
        ? raw.label.trim()
        : fallback.label,
    type: normalizedType,
    value: normalizedType === 'nothing' ? 0 : parsedValue,
    weight: toPositiveInt(raw.weight, fallback.weight),
  };
}

export function normalizePointsMatrix(value: unknown): PointsMatrix {
  if (!value || typeof value !== 'object') {
    return DEFAULT_POINTS_MATRIX;
  }

  const raw = value as Record<string, unknown>;
  const rawFeedback = raw.feedback as Record<string, unknown> | undefined;
  const rawConsumption = raw.consumptionReview as Record<string, unknown> | undefined;
  const rawReferral = raw.referral as Record<string, unknown> | undefined;
  const rawBirthday = raw.birthday as Record<string, unknown> | undefined;
  const rawStreak = raw.streak as Record<string, unknown> | undefined;
  const rawQuest = raw.quest as Record<string, unknown> | undefined;
  const rawSpin = raw.spin as Record<string, unknown> | undefined;

  const milestonesInput = Array.isArray(rawStreak?.milestones)
    ? rawStreak?.milestones
    : DEFAULT_POINTS_MATRIX.streak.milestones;

  const milestones = milestonesInput
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      return {
        days: toPositiveInt(row.days, 1),
        points: toNonNegativeInt(row.points, 0),
      };
    })
    .filter((entry): entry is { days: number; points: number } => !!entry)
    .sort((a, b) => a.days - b.days);

  const spinPrizesInput = Array.isArray(rawSpin?.prizes)
    ? rawSpin.prizes
    : DEFAULT_POINTS_MATRIX.spin.prizes;

  const spinPrizes = spinPrizesInput
    .map((entry, index) =>
      normalizeSpinPrize(
        entry,
        DEFAULT_POINTS_MATRIX.spin.prizes[index] ??
          DEFAULT_POINTS_MATRIX.spin.prizes[index % DEFAULT_POINTS_MATRIX.spin.prizes.length],
        index
      )
    )
    .filter((entry) => entry.weight > 0);

  return {
    feedback: {
      longTextThreshold: toPositiveInt(
        rawFeedback?.longTextThreshold,
        DEFAULT_POINTS_MATRIX.feedback.longTextThreshold
      ),
      base: readRewardGrant(rawFeedback?.base, DEFAULT_POINTS_MATRIX.feedback.base),
      detailed: readRewardGrant(rawFeedback?.detailed, DEFAULT_POINTS_MATRIX.feedback.detailed),
    },
    consumptionReview: {
      longTextThreshold: toPositiveInt(
        rawConsumption?.longTextThreshold,
        DEFAULT_POINTS_MATRIX.consumptionReview.longTextThreshold
      ),
      base: readRewardGrant(rawConsumption?.base, DEFAULT_POINTS_MATRIX.consumptionReview.base),
      detailed: readRewardGrant(
        rawConsumption?.detailed,
        DEFAULT_POINTS_MATRIX.consumptionReview.detailed
      ),
    },
    referral: {
      referredPoints: toNonNegativeInt(
        rawReferral?.referredPoints,
        DEFAULT_POINTS_MATRIX.referral.referredPoints
      ),
      referrerPoints: toNonNegativeInt(
        rawReferral?.referrerPoints,
        DEFAULT_POINTS_MATRIX.referral.referrerPoints
      ),
    },
    birthday: {
      points: toNonNegativeInt(rawBirthday?.points, DEFAULT_POINTS_MATRIX.birthday.points),
    },
    streak: {
      milestones: milestones.length > 0 ? milestones : DEFAULT_POINTS_MATRIX.streak.milestones,
    },
    quest: {
      default: readRewardGrant(rawQuest?.default, DEFAULT_POINTS_MATRIX.quest.default),
    },
    spin: {
      enabled: typeof rawSpin?.enabled === 'boolean' ? rawSpin.enabled : DEFAULT_POINTS_MATRIX.spin.enabled,
      dailyLimit: toPositiveInt(rawSpin?.dailyLimit, DEFAULT_POINTS_MATRIX.spin.dailyLimit),
      prizes: spinPrizes.length > 0 ? spinPrizes : DEFAULT_POINTS_MATRIX.spin.prizes,
    },
  };
}

const POINTS_MATRIX_CACHE_TTL_MS = 60_000; // 60s
let pointsMatrixCache: { value: PointsMatrix; expiresAt: number } | null = null;

/** Invalidate cache after admin updates points matrix (called from settings route). */
export function clearPointsMatrixCache(): void {
  pointsMatrixCache = null;
}

export async function getPointsMatrix(db: SettingsReader = prisma): Promise<PointsMatrix> {
  const now = Date.now();
  if (pointsMatrixCache && pointsMatrixCache.expiresAt > now) {
    return pointsMatrixCache.value;
  }
  const setting = await db.settings.findUnique({
    where: { key: POINTS_MATRIX_SETTING_KEY },
    select: { value: true },
  });
  const value = normalizePointsMatrix(setting?.value);
  pointsMatrixCache = { value, expiresAt: now + POINTS_MATRIX_CACHE_TTL_MS };
  return value;
}

export function getDefaultPointsMatrix(): PointsMatrix {
  return DEFAULT_POINTS_MATRIX;
}

export function getFeedbackReward(text: string | null | undefined, matrix: PointsMatrix): RewardGrant {
  const isDetailed = !!text && text.trim().length >= matrix.feedback.longTextThreshold;
  return isDetailed ? matrix.feedback.detailed : matrix.feedback.base;
}

export function getConsumptionReviewReward(
  text: string | null | undefined,
  matrix: PointsMatrix
): RewardGrant {
  const isDetailed = !!text && text.trim().length >= matrix.consumptionReview.longTextThreshold;
  return isDetailed ? matrix.consumptionReview.detailed : matrix.consumptionReview.base;
}

export function getReferralRewards(matrix: PointsMatrix): {
  referredPoints: number;
  referrerPoints: number;
} {
  return matrix.referral;
}

export function getBirthdayBonusPoints(matrix: PointsMatrix): number {
  return matrix.birthday.points;
}

export function getStreakMilestones(matrix: PointsMatrix): Array<{ days: number; points: number }> {
  return matrix.streak.milestones;
}

export function getStreakMilestoneBonus(days: number, matrix: PointsMatrix): number {
  const match = matrix.streak.milestones.find((entry) => entry.days === days);
  return match?.points ?? 0;
}

export function getQuestReward(reward: unknown, matrix: PointsMatrix): RewardGrant {
  if (!reward || typeof reward !== 'object') {
    return matrix.quest.default;
  }

  const payload = reward as Record<string, unknown>;
  const points = toNonNegativeInt(payload.points, matrix.quest.default.points);
  const xp = toNonNegativeInt(payload.xp, Math.floor(points / 2));

  return {
    points,
    xp,
  };
}

export function getSpinRules(matrix: PointsMatrix): PointsMatrix['spin'] {
  return matrix.spin;
}

export function pickSpinPrize(
  matrix: PointsMatrix,
  randomValue: number = Math.random()
): SpinPrizeRule {
  const rules = matrix.spin.prizes;
  const totalWeight = rules.reduce((sum, prize) => sum + prize.weight, 0);

  if (totalWeight <= 0 || rules.length === 0) {
    return DEFAULT_POINTS_MATRIX.spin.prizes[DEFAULT_POINTS_MATRIX.spin.prizes.length - 1];
  }

  let cursor = Math.max(0, Math.min(0.999999, randomValue)) * totalWeight;
  for (const prize of rules) {
    cursor -= prize.weight;
    if (cursor <= 0) {
      return prize;
    }
  }

  return rules[rules.length - 1];
}
