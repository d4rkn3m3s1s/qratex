/**
 * Geri bildirim ödülü — hesap TEK yerde (gönderim, sonradan bağlama ve önizleme aynı zinciri
 * kullanır; sunucu otoriter, §4.4 ilke 6).
 *
 * Zincir: admin puan matrisi (taban / detaylı) → VIP çarpanı → sezonsal kampanya → platform
 * geneli gamification çarpanı. Tavan ve kredi `mintPoints` içinde (lib/economy) uygulanır.
 * "Detaylı yorum" YALNIZ kullanıcının kendi yazdığı metne bakar (hızlı etiketler sayılmaz).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getPointsMatrix, type PointsMatrix } from '@/lib/points-rules';
import { ECONOMY_CAPS, sumEarnedInWindow } from '@/lib/economy';
import { calculateLevelProgress, calculateXpToNextLevel } from '@/lib/utils';

type Db = Prisma.TransactionClient | typeof prisma;

export function isDetailedText(userText: string | null | undefined, matrix: PointsMatrix): boolean {
  const own = typeof userText === 'string' ? userText.trim() : '';
  return own.length >= matrix.feedback.longTextThreshold;
}

export type FeedbackGrant = {
  points: number;
  xp: number;
  meta: {
    detailed: boolean;
    basePoints: number;
    vipMultiplier: number;
    seasonalMultiplier: number;
    seasonalBonus: number;
    seasonalCampaignId: string | null;
    globalPointMultiplier: number;
    globalXpMultiplier: number;
  };
};

/** Kullanıcıya özel istenen ödül (tavan ÖNCESİ). */
export async function computeFeedbackGrant(
  db: Db,
  userId: string,
  detailed: boolean,
  matrix: PointsMatrix,
  now: Date = new Date()
): Promise<FeedbackGrant> {
  const base = detailed ? matrix.feedback.detailed : matrix.feedback.base;
  const [{ applyVipMultiplier }, { applySeasonalCampaignMultiplier }, { getGamificationMultipliers }] = await Promise.all([
    import('@/lib/vip-multiplier'),
    import('@/lib/seasonal-campaign-live'),
    import('@/lib/gamification-settings'),
  ]);
  const global = await getGamificationMultipliers();
  const vip = await applyVipMultiplier(userId, base.points, db);
  const seasonal = await applySeasonalCampaignMultiplier(vip.points, now, db, userId);
  const points = Math.max(0, Math.floor(seasonal.points * global.pointMultiplier));
  const xp = Math.max(0, Math.floor(base.xp * global.xpMultiplier));
  return {
    points,
    xp,
    meta: {
      detailed,
      basePoints: base.points,
      vipMultiplier: vip.multiplier,
      seasonalMultiplier: seasonal.multiplier,
      seasonalBonus: seasonal.bonusPoints,
      seasonalCampaignId: seasonal.campaignId,
      globalPointMultiplier: global.pointMultiplier,
      globalXpMultiplier: global.xpMultiplier,
    },
  };
}

export function levelProgress(totalXp: number): { levelProgressPct: number; xpToNextLevel: number } {
  // Kredi yolu (`creditPointsAndXp` → `calculateLevel`) ile aynı eğri.
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  const pct = Math.round(calculateLevelProgress(xp));
  return { levelProgressPct: Math.max(0, Math.min(100, pct)), xpToNextLevel: Math.max(0, calculateXpToNextLevel(xp)) };
}

/** Kalan günlük/haftalık geri bildirim puanı (tavanı uygulayan sayımla aynı pencere). */
export function remainingFromEarned(earned: { today: number; week: number }): number {
  const rule = ECONOMY_CAPS.feedback;
  const daily = rule.daily === undefined ? Number.POSITIVE_INFINITY : rule.daily - earned.today;
  const weekly = rule.weekly === undefined ? Number.POSITIVE_INFINITY : rule.weekly - earned.week;
  const remaining = Math.min(daily, weekly);
  return Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : 0;
}

export type RewardPreview =
  /** Oturumsuz: taban değerler ("üye olarak gönderirsen"). */
  | { mode: 'guest'; basePoints: number; detailedPoints: number; threshold: number }
  /** Üye: çarpanlar dahil, tavanla kısıtlı. */
  | {
      mode: 'member';
      basePoints: number;
      detailedPoints: number;
      threshold: number;
      remainingToday: number;
      xpBase: number;
      xpDetailed: number;
    }
  /** İşletmenin sahibi/personeli: ödül yok. */
  | { mode: 'insider' };

/**
 * Sayfa ilk render'ı için önizleme. Hata olursa `null` (UI önizlemeyi gizler; sahte sayı yok).
 */
export async function loadRewardPreview(
  viewer: { userId: string } | null,
  insider: boolean,
  now: Date = new Date()
): Promise<RewardPreview | null> {
  try {
    if (insider) return { mode: 'insider' };
    const matrix = await getPointsMatrix();
    if (!viewer) {
      return {
        mode: 'guest',
        basePoints: matrix.feedback.base.points,
        detailedPoints: matrix.feedback.detailed.points,
        threshold: matrix.feedback.longTextThreshold,
      };
    }
    const [base, detailed, earned] = await Promise.all([
      computeFeedbackGrant(prisma, viewer.userId, false, matrix, now),
      computeFeedbackGrant(prisma, viewer.userId, true, matrix, now),
      sumEarnedInWindow(prisma, { userId: viewer.userId, rule: ECONOMY_CAPS.feedback, now }),
    ]);
    return {
      mode: 'member',
      basePoints: base.points,
      detailedPoints: detailed.points,
      threshold: matrix.feedback.longTextThreshold,
      remainingToday: remainingFromEarned(earned),
      xpBase: base.xp,
      xpDetailed: detailed.xp,
    };
  } catch (err) {
    console.error('[feedback-funnel] ödül önizlemesi okunamadı', err);
    return null;
  }
}
