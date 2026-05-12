export type BadgeRequirementType =
  | 'feedback_count'
  | 'points'
  | 'streak'
  | 'longest_streak'
  | 'level'
  | 'referral'
  | 'quests'
  | 'custom';

export interface BadgeAlgorithmConfig {
  thresholds: {
    common: number;
    rare: number;
    epic: number;
    legendary: number;
  };
  weights: {
    feedbackCount: number;
    totalPoints: number;
    streak: number;
    level: number;
    referrals: number;
    quests: number;
  };
  multipliers: {
    weekend: number;
    campaign: number;
    retentionBoost: number;
  };
  rarityBasePointCost: {
    COMMON: number;
    RARE: number;
    EPIC: number;
    LEGENDARY: number;
  };
}

export const DEFAULT_BADGE_ALGORITHM_CONFIG: BadgeAlgorithmConfig = {
  thresholds: { common: 20, rare: 45, epic: 70, legendary: 90 },
  weights: {
    feedbackCount: 0.3,
    totalPoints: 0.25,
    streak: 0.2,
    level: 0.1,
    referrals: 0.1,
    quests: 0.05,
  },
  multipliers: {
    weekend: 1.05,
    campaign: 1.15,
    retentionBoost: 1.1,
  },
  rarityBasePointCost: {
    COMMON: 200,
    RARE: 900,
    EPIC: 2200,
    LEGENDARY: 5000,
  },
};

export const BADGE_ALGORITHM_PRESETS: Record<string, BadgeAlgorithmConfig> = {
  balanced: DEFAULT_BADGE_ALGORITHM_CONFIG,
  growthHeavy: {
    ...DEFAULT_BADGE_ALGORITHM_CONFIG,
    weights: {
      feedbackCount: 0.2,
      totalPoints: 0.35,
      streak: 0.1,
      level: 0.15,
      referrals: 0.15,
      quests: 0.05,
    },
    multipliers: {
      weekend: 1.03,
      campaign: 1.25,
      retentionBoost: 1.05,
    },
  },
  retentionHeavy: {
    ...DEFAULT_BADGE_ALGORITHM_CONFIG,
    weights: {
      feedbackCount: 0.35,
      totalPoints: 0.2,
      streak: 0.25,
      level: 0.1,
      referrals: 0.05,
      quests: 0.05,
    },
    multipliers: {
      weekend: 1.1,
      campaign: 1.08,
      retentionBoost: 1.2,
    },
  },
};

export interface BadgeSimulationInput {
  feedbackCount: number;
  totalPoints: number;
  streak: number;
  level: number;
  referrals: number;
  quests: number;
  weekend?: boolean;
  campaign?: boolean;
  retentionRisk?: boolean;
}

export function simulateBadgeScore(config: BadgeAlgorithmConfig, input: BadgeSimulationInput) {
  const normalized = {
    feedbackCount: Math.min(100, input.feedbackCount),
    totalPoints: Math.min(100, input.totalPoints / 100),
    streak: Math.min(100, input.streak * 4),
    level: Math.min(100, input.level * 8),
    referrals: Math.min(100, input.referrals * 12),
    quests: Math.min(100, input.quests * 6),
  };

  const weighted =
    normalized.feedbackCount * config.weights.feedbackCount +
    normalized.totalPoints * config.weights.totalPoints +
    normalized.streak * config.weights.streak +
    normalized.level * config.weights.level +
    normalized.referrals * config.weights.referrals +
    normalized.quests * config.weights.quests;

  let multiplier = 1;
  if (input.weekend) multiplier *= config.multipliers.weekend;
  if (input.campaign) multiplier *= config.multipliers.campaign;
  if (input.retentionRisk) multiplier *= config.multipliers.retentionBoost;

  const score = Math.max(0, Math.min(100, Number((weighted * multiplier).toFixed(2))));

  let predictedRarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' = 'COMMON';
  if (score >= config.thresholds.legendary) predictedRarity = 'LEGENDARY';
  else if (score >= config.thresholds.epic) predictedRarity = 'EPIC';
  else if (score >= config.thresholds.rare) predictedRarity = 'RARE';

  return {
    score,
    predictedRarity,
    recommendedPointCost: config.rarityBasePointCost[predictedRarity],
    normalized,
    multiplier: Number(multiplier.toFixed(3)),
  };
}

