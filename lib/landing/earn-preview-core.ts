/**
 * Vitrin kazanç önizlemesi — istemci-güvenli tipler ve saf kural (Prisma içe aktarmaz).
 * Sunucu yükleyicisi: `./earn-preview.ts`.
 */
export interface RewardGrantView {
  points: number;
  xp: number;
}

export interface EarnPreview {
  feedback: { base: RewardGrantView; detailed: RewardGrantView; longTextThreshold: number };
  feedbackDailyCap: number;
  referral: { referrerPoints: number; referredPoints: number };
  /** İlk birkaç seri kilometre taşı (gün → bonus puan). */
  streakMilestones: Array<{ days: number; points: number }>;
  /** Lig basamakları (ad + giriş puanı), düşükten yükseğe. */
  leagues: Array<{ key: string; name: string; minPoints: number }>;
  /** Karakter rozeti kategorileri (ad, emoji, karakter sayısı). */
  characterCategories: Array<{ key: string; name: string; emoji: string; count: number; mystery: boolean }>;
  characterCount: number;
  spinEnabled: boolean;
}

/**
 * Bir geri bildirimin TEMEL kazancı — ekonomideki `getFeedbackReward` ile aynı kural
 * (metin, boşluklar kırpıldıktan sonra eşik uzunluğuna ulaşırsa "detaylı").
 * VIP/sezon çarpanları ve günlük tavan ayrıca uygulanır; vitrin bunu metinde belirtir.
 */
export function previewFeedbackReward(text: string, feedback: EarnPreview['feedback']): RewardGrantView & { detailed: boolean } {
  const detailed = text.trim().length >= feedback.longTextThreshold;
  const grant = detailed ? feedback.detailed : feedback.base;
  return { points: grant.points, xp: grant.xp, detailed };
}
