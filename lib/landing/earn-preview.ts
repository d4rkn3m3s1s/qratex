/**
 * Vitrindeki "nasıl kazanırım?" değerleri — SUNUCU OTORİTER.
 *
 * Ana sayfadaki puan/XP, davet ödülü, seri kilometre taşları, lig basamakları ve karakter
 * rozeti kataloğu elle yazılmaz; ekonominin kendi kaynaklarından okunur:
 *   - puan matrisi (`lib/points-rules`, admin → Oyunlaştırma → Puan matrisi)
 *   - günlük geri bildirim tavanı (`lib/economy/caps`)
 *   - lig kuralları (`lib/league-rules`, admin → Lig ayarları)
 *   - karakter kategorileri (`lib/character-categories`)
 * DB erişilemezse kodun kendi varsayılanlarına düşer (bunlar da ekonominin gerçek
 * varsayılanlarıdır; uydurma sayı değildir). Build-time fail-safe.
 */
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getDefaultPointsMatrix, getPointsMatrix, type PointsMatrix } from '@/lib/points-rules';
import { DEFAULT_LEAGUE_RULES, type LeagueRule } from '@/lib/league-rules-core';
import { getLeagueRules } from '@/lib/league-rules';
import { FEEDBACK_DAILY_CAP } from '@/lib/economy/caps';
import { CHARACTER_CATEGORIES } from '@/lib/character-categories';
import type { EarnPreview } from './earn-preview-core';

export type { EarnPreview } from './earn-preview-core';
export { previewFeedbackReward } from './earn-preview-core';

const MYSTERY_CATEGORY_KEY = 'gizemli';

/** Saf birleştirici (testli). */
export function buildEarnPreview(matrix: PointsMatrix, leagues: LeagueRule[]): EarnPreview {
  const categories = CHARACTER_CATEGORIES.map((c) => ({
    key: c.key,
    name: c.name,
    emoji: c.emoji,
    count: c.characterIds.length,
    mystery: c.key === MYSTERY_CATEGORY_KEY,
  })).filter((c) => c.count > 0);
  return {
    feedback: {
      base: { ...matrix.feedback.base },
      detailed: { ...matrix.feedback.detailed },
      longTextThreshold: matrix.feedback.longTextThreshold,
    },
    feedbackDailyCap: FEEDBACK_DAILY_CAP,
    referral: { ...matrix.referral },
    streakMilestones: [...matrix.streak.milestones]
      .filter((m) => m.days > 0 && m.points > 0)
      .sort((a, b) => a.days - b.days)
      .slice(0, 3),
    leagues: [...(leagues.length ? leagues : DEFAULT_LEAGUE_RULES)]
      .sort((a, b) => a.minPoints - b.minPoints)
      .map((l) => ({ key: l.key, name: l.name, minPoints: l.minPoints })),
    characterCategories: categories,
    characterCount: categories.reduce((sum, c) => sum + c.count, 0),
    spinEnabled: matrix.spin.enabled,
  };
}

async function loadSources(): Promise<EarnPreview> {
  const [matrix, leagues] = await Promise.all([
    getPointsMatrix(prisma).catch(() => getDefaultPointsMatrix()),
    getLeagueRules(prisma).catch(() => DEFAULT_LEAGUE_RULES),
  ]);
  return buildEarnPreview(matrix, leagues);
}

const loadCached = unstable_cache(loadSources, ['landing-earn-preview-v1'], {
  revalidate: 300,
  tags: ['settings', 'public-earn-preview'],
});

async function getEarnPreviewImpl(): Promise<EarnPreview> {
  try {
    return await loadCached();
  } catch {
    return buildEarnPreview(getDefaultPointsMatrix(), DEFAULT_LEAGUE_RULES);
  }
}

export const getEarnPreview = cache(getEarnPreviewImpl);
