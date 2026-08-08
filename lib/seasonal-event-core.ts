/**
 * Sezonluk etkinlik challenge çekirdeği (saf mantık). Bir SeasonalCampaign, etkinlik
 * penceresinde (startDate..endDate) tamamlanacak bir hedef (challengeType + challengeGoal)
 * tanımlayabilir; tamamlayan kullanıcı özel ödül alır. İlerleme, o pencerede oynanan oyun
 * veya yazılan yorum sayısından hesaplanır. Zaman/eşik hesabı saf; DB okuması route'ta.
 */

export type ChallengeType = 'games_played' | 'reviews_written';

export interface ChallengeSpec {
  type: ChallengeType;
  goal: number;
  rewardPoints: number;
  rewardBadgeId: string | null;
}

/** Kampanya alanlarından geçerli bir challenge spec üretir; eksikse null (challenge yok). */
export function parseChallengeSpec(campaign: {
  challengeType: string | null;
  challengeGoal: number | null;
  challengeRewardPoints: number | null;
  challengeRewardBadgeId: string | null;
}): ChallengeSpec | null {
  const type = campaign.challengeType;
  const goal = campaign.challengeGoal;
  if ((type !== 'games_played' && type !== 'reviews_written') || !goal || goal <= 0) return null;
  return {
    type,
    goal,
    rewardPoints: campaign.challengeRewardPoints && campaign.challengeRewardPoints > 0 ? campaign.challengeRewardPoints : 0,
    rewardBadgeId: campaign.challengeRewardBadgeId ?? null,
  };
}

/** İlerleme durumu: mevcut/hedef/oran/tamam. */
export function challengeProgress(current: number, goal: number): {
  current: number;
  goal: number;
  ratio: number;
  complete: boolean;
} {
  const safeGoal = goal > 0 ? goal : 1;
  const clamped = Math.max(0, current);
  return {
    current: clamped,
    goal,
    ratio: Math.max(0, Math.min(1, clamped / safeGoal)),
    complete: clamped >= goal,
  };
}

/** ms → gün/saat/dakika geri sayım metni. */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} gün ${h} saat`;
  if (h > 0) return `${h} saat ${m} dakika`;
  return `${m} dakika`;
}

/** Kampanya penceresine kalan ms (bitişe). Geçmişse 0. */
export function msUntilEnd(endDate: Date, now: Date): number {
  return Math.max(0, endDate.getTime() - now.getTime());
}

/** Kampanya şu an aktif mi (pencere + isActive çağrı tarafında). */
export function isWithinWindow(startDate: Date, endDate: Date, now: Date): boolean {
  return now >= startDate && now <= endDate;
}
