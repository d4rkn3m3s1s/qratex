/**
 * Referral kademe (milestone) ödülleri: kullanıcı belirli sayıda BAŞARILI davet
 * (COMPLETED) yaptıkça ekstra bonus puan kazanır. Düz sayaç yerine hedef-odaklı
 * ilerleme sağlar ("2 davet daha → +200 puan"). Ödül, davet başına verilen puanın
 * ÜSTÜNE bir kez verilir (atomik claim, route'ta).
 *
 * Saf mantık burada (test edilebilir); DB claim'i route'ta.
 */

export interface ReferralMilestone {
  /** Bu kademeyi açmak için gereken BAŞARILI davet sayısı. */
  count: number;
  /** Kademe bonusu (puan). */
  points: number;
  /** UI etiketi. */
  label: string;
}

/** Kademe eşikleri (artan). Her biri, o sayıya ULAŞINCA bir kez verilir. */
export const REFERRAL_MILESTONES: ReferralMilestone[] = [
  { count: 3, points: 200, label: 'İlk 3 davet' },
  { count: 5, points: 400, label: '5 davet' },
  { count: 10, points: 1000, label: '10 davet' },
  { count: 25, points: 3000, label: '25 davet' },
];

/** claimedMilestones JSON'unu güvenli number[]'a çevirir. */
export function parseClaimedReferralMilestones(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/**
 * Verilen başarılı davet sayısı ve önceden alınan kademeler için, ŞU AN talep
 * edilebilir (ulaşılmış ama alınmamış) kademeleri döndürür.
 */
export function claimableReferralMilestones(
  completedCount: number,
  claimed: number[]
): ReferralMilestone[] {
  const claimedSet = new Set(claimed);
  return REFERRAL_MILESTONES.filter((m) => completedCount >= m.count && !claimedSet.has(m.count));
}

/** Bir sonraki (henüz ulaşılmamış) kademe — ilerleme çubuğu için. null = hepsi geçildi. */
export function nextReferralMilestone(completedCount: number): ReferralMilestone | null {
  return REFERRAL_MILESTONES.find((m) => completedCount < m.count) ?? null;
}

/** İlerleme durumu: bir sonraki kademeye ne kadar kaldı (UI çubuğu). */
export function referralProgress(completedCount: number): {
  next: ReferralMilestone | null;
  current: number;
  target: number | null;
  ratio: number;
} {
  const next = nextReferralMilestone(completedCount);
  if (!next) return { next: null, current: completedCount, target: null, ratio: 1 };
  // Bir önceki kademe eşiği (taban) → çubuk o tabandan hedefe göre dolar.
  const prevThreshold = [...REFERRAL_MILESTONES].reverse().find((m) => m.count <= completedCount)?.count ?? 0;
  const span = next.count - prevThreshold;
  const done = completedCount - prevThreshold;
  return {
    next,
    current: completedCount,
    target: next.count,
    ratio: span > 0 ? Math.max(0, Math.min(1, done / span)) : 0,
  };
}
