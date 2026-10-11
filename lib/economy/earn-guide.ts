/**
 * Puan Rehberi — "puanı nereden, ne kadar, hangi sınırla kazanırım?" (oyunlaştırma-ekonomi O7).
 *
 * Önceki durum: günlük/haftalık tavanlar müşteriye hiçbir yerde anlatılmıyordu (tavan dolunca
 * kredi sessizce 0 oluyordu), kaynak başına miktar yalnız yönetici panelindeydi; giriş serisi
 * taşlarının ömür boyu bir kez olduğu ve oyun puanının ayrı tavanı bilinmiyordu.
 *
 * Bu modül rehberi ELLE YAZILMIŞ metinden değil, ödemeyi yapan kodun kendi kaynaklarından üretir:
 *  - Miktarlar: puan matrisi (`getPointsMatrix`, yöneticinin Ekonomi Stüdyosu ayarı).
 *  - Sınırlar: `ECONOMY_CAPS` (mintPoints'in uyguladığı tablo) ve tüketim pasif puanı sabitleri.
 *  - "Bugün" ilerlemesi: tavanı uygulayan sayımın AYNISI (`sumEarnedInWindow`, UTC günü/haftası).
 *  - Seri taşları: `getLoginStreakMilestones` (touchLoginStreak'in ödediği liste).
 *  - Rozet ödülü aralığı: `badgeRewardPoints`'in okuduğu metin tabloları.
 * Böylece ayar değişince rehber de değişir; rehber ile ödeme ayrışamaz.
 */
import { prisma } from '@/lib/prisma';
import { getPointsMatrix, getDefaultPointsMatrix, type PointsMatrix } from '@/lib/points-rules';
import { getLoginStreakMilestones, type LoginStreakMilestone } from '@/lib/login-streak';
import { EMOJI_BADGE_TEXTS } from '@/lib/emoji-badge-texts';
import { CHARACTER_REVEAL_TEXTS } from '@/lib/character-reveal-texts';
import { PASSIVE_POINTS_MAX_PER_CONSUMPTION } from '@/lib/consumption/service';
import { ECONOMY_CAPS, sumEarnedInWindow } from './caps';

export type CapProgress = {
  /** Bugün (UTC günü — tavanı uygulayan sayımla aynı) bu kovadan kazanılan. */
  today: number;
  daily: number;
  /** Bu hafta (Pazartesi başlangıçlı UTC) kazanılan; haftalık tavan yoksa null. */
  week: number | null;
  weekly: number | null;
};

export type EarnGuide = {
  feedback: { base: number; detailed: number; longTextThreshold: number; cap: CapProgress };
  review: { base: number; detailed: number; longTextThreshold: number };
  game: { cap: CapProgress };
  visit: { perConsumptionMax: number; perPlaceDaily: number; daily: number; today: number };
  streak: { milestones: LoginStreakMilestone[] };
  referral: { referred: number; referrer: number };
  birthday: number;
  questDefault: number;
  spin: { enabled: boolean; dailyLimit: number; maxPrize: number };
  badges: { min: number; max: number };
};

function badgeRange(): { min: number; max: number } {
  const values = [...Object.values(EMOJI_BADGE_TEXTS), ...Object.values(CHARACTER_REVEAL_TEXTS)]
    .map((t) => Math.floor(Number(t.points)))
    .filter((p) => Number.isFinite(p) && p > 0);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 0 };
}

const BADGE_RANGE = badgeRange();

/** Saf: matris + tavan sayımlarından rehber (test edilir). */
export function buildEarnGuide(input: {
  matrix: PointsMatrix;
  milestones: LoginStreakMilestone[];
  feedback: { today: number; week: number };
  game: { today: number; week: number };
  visitToday: number;
}): EarnGuide {
  const { matrix } = input;
  const fb = ECONOMY_CAPS.feedback;
  const gm = ECONOMY_CAPS.game;
  const dp = ECONOMY_CAPS.dealer_passive;
  const spinPoints = matrix.spin.prizes.filter((p) => p.type === 'points').map((p) => p.value);
  return {
    feedback: {
      base: matrix.feedback.base.points,
      detailed: matrix.feedback.detailed.points,
      longTextThreshold: matrix.feedback.longTextThreshold,
      cap: { today: input.feedback.today, daily: fb.daily, week: input.feedback.week, weekly: fb.weekly },
    },
    review: {
      base: matrix.consumptionReview.base.points,
      detailed: matrix.consumptionReview.detailed.points,
      longTextThreshold: matrix.consumptionReview.longTextThreshold,
    },
    game: { cap: { today: input.game.today, daily: gm.daily, week: input.game.week, weekly: gm.weekly } },
    visit: {
      perConsumptionMax: PASSIVE_POINTS_MAX_PER_CONSUMPTION,
      perPlaceDaily: dp.perActorDaily ?? 0,
      daily: dp.daily ?? 0,
      today: input.visitToday,
    },
    streak: { milestones: input.milestones },
    referral: { referred: matrix.referral.referredPoints, referrer: matrix.referral.referrerPoints },
    birthday: matrix.birthday.points,
    questDefault: matrix.quest.default.points,
    spin: {
      enabled: matrix.spin.enabled,
      dailyLimit: matrix.spin.dailyLimit,
      maxPrize: spinPoints.length ? Math.max(...spinPoints) : 0,
    },
    badges: BADGE_RANGE,
  };
}

/** Müşterinin rehberi (sunucu). Tavan sayımları okunamazsa hata yukarı taşınır (çağıran `null` gösterir). */
export async function getEarnGuide(userId: string, now: Date = new Date()): Promise<EarnGuide> {
  const [matrix, milestones, feedback, game, visit] = await Promise.all([
    getPointsMatrix().catch(() => getDefaultPointsMatrix()),
    getLoginStreakMilestones(),
    sumEarnedInWindow(prisma, { userId, rule: ECONOMY_CAPS.feedback, now }),
    sumEarnedInWindow(prisma, { userId, rule: ECONOMY_CAPS.game, now }),
    sumEarnedInWindow(prisma, { userId, rule: ECONOMY_CAPS.dealer_passive, now }),
  ]);
  return buildEarnGuide({
    matrix,
    milestones,
    feedback: { today: feedback.today, week: feedback.week },
    game: { today: game.today, week: game.week },
    visitToday: visit.today,
  });
}
