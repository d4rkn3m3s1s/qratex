/**
 * Trust Score (Güven Skoru) çekirdeği — kötü niyetli yorumculara karşı.
 *
 * Amaç: Sürekli/kasıtlı düşük puan verip işletmenin ortalamasını düşüren kullanıcıları
 * tespit etmek. Politika "sadece işaretle": şüpheli yorum silinmez/gizlenmez; işaretlenir,
 * bayi/admin görür. User.trustScore (0-100) yorum gönderiminde sinyallerle güncellenir.
 *
 * Sinyaller (hepsi non-AI, ucuz sayım sorguları — yanıt gecikmesini etkilemez):
 *  - Aynı işletmeye kısa sürede çok yorum (spam sıklığı)
 *  - Aynı işletmeye tekrar tekrar çok düşük puan (hedefli kötüleme)
 *  - Platform genelinde aşırı düşük puan oranı (kronik negatiflik)
 *
 * trustScore yüksek (100) başlar; şüpheli desenlerde düşer, iyi davranışta toparlar.
 */
import { prisma } from '@/lib/prisma';

const DAY = 24 * 60 * 60 * 1000;

export type TrustTier = 'trusted' | 'neutral' | 'watch' | 'low';

export function trustTierFromScore(score: number): TrustTier {
  if (score >= 80) return 'trusted';
  if (score >= 55) return 'neutral';
  if (score >= 30) return 'watch';
  return 'low';
}

/** Aynı kullanıcının bir işletmeye kısa sürede gönderebileceği yorum yumuşak limiti. */
export const PER_DEALER_DAILY_FEEDBACK_SOFT_LIMIT = 3;

export interface TrustEvaluation {
  /** Bu yorum şüpheli mi (işaretlenmeli mi)? */
  flagged: boolean;
  /** İşaretleme/etki sebebi (insan-okur). */
  reason: string | null;
  /** Yeni kullanıcı trust skoru (0-100). */
  newScore: number;
  tier: TrustTier;
  /** Bu işletmeye bugünkü yorum sayısı yumuşak limiti aştı mı (uyarı için). */
  overSoftLimit: boolean;
}

export interface TrustInput {
  userId: string;
  dealerId: string;
  rating: number;
}

/**
 * Yorum oluşturulduktan SONRA çağrılır. Geçmiş sinyalleri sayar, trustScore'u günceller,
 * yorumun işaretlenip işaretlenmeyeceğini döner. Hiçbir şeyi silmez/gizlemez.
 */
export async function evaluateTrustOnFeedback(input: TrustInput): Promise<TrustEvaluation> {
  const { userId, dealerId, rating } = input;
  const since = new Date(Date.now() - DAY);
  const since30d = new Date(Date.now() - 30 * DAY);

  const baseWhere = { userId, qrCode: { dealerId }, deletedAt: null };

  const [user, dealerToday, dealerLow30d, globalTotal30d, globalLow30d] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { trustScore: true },
    }),
    // Bu işletmeye son 24 saatteki yorum sayısı (spam sıklığı)
    prisma.feedback.count({ where: { ...baseWhere, createdAt: { gte: since } } }),
    // Bu işletmeye son 30 günde verilen çok düşük puan (<=2) sayısı (hedefli kötüleme)
    prisma.feedback.count({
      where: { ...baseWhere, createdAt: { gte: since30d }, rating: { lte: 2 } },
    }),
    // Platform genelinde son 30 günde toplam yorum (kronik negatiflik paydası)
    prisma.feedback.count({
      where: { userId, deletedAt: null, createdAt: { gte: since30d } },
    }),
    // Platform genelinde son 30 günde çok düşük puan sayısı
    prisma.feedback.count({
      where: { userId, deletedAt: null, createdAt: { gte: since30d }, rating: { lte: 2 } },
    }),
  ]);

  const currentScore = user?.trustScore ?? 100;
  let delta = 0;
  const reasons: string[] = [];

  // 1) Spam sıklığı: aynı işletmeye 24 saatte yumuşak limitten fazla yorum.
  const overSoftLimit = dealerToday > PER_DEALER_DAILY_FEEDBACK_SOFT_LIMIT;
  if (overSoftLimit) {
    delta -= 12;
    reasons.push('aynı işletmeye kısa sürede çok yorum');
  }

  // 2) Hedefli kötüleme: aynı işletmeye 30 günde 3+ kez çok düşük puan.
  const targetedNegativity = dealerLow30d >= 3 && rating <= 2;
  if (targetedNegativity) {
    delta -= 10;
    reasons.push('aynı işletmeye tekrar tekrar çok düşük puan');
  }

  // 3) Kronik negatiflik: platform genelinde düşük puan oranı yüksek (yeterli örnekle).
  const chronicNegativity =
    globalTotal30d >= 5 && globalLow30d / globalTotal30d >= 0.7 && rating <= 2;
  if (chronicNegativity) {
    delta -= 8;
    reasons.push('genel olarak aşırı yüksek düşük-puan oranı');
  }

  // İyi davranış toparlaması: bu yorum şüpheli değilse skor yavaşça yükselir.
  if (delta === 0) {
    delta += 2;
  }

  const newScore = Math.max(0, Math.min(100, currentScore + delta));
  const tier = trustTierFromScore(newScore);

  // Yorum işaretleme: bu yorumda en az bir şüpheli sinyal varsa VEYA kullanıcı zaten
  // düşük güven kademesindeyse işaretle.
  const flaggedBySignal = reasons.length > 0;
  const flaggedByTier = (tier === 'low' || tier === 'watch') && rating <= 2;
  const flagged = flaggedBySignal || flaggedByTier;
  const reason = flagged
    ? (reasons.length > 0 ? reasons.join(', ') : 'düşük güven skorlu kullanıcı')
    : null;

  return { flagged, reason, newScore, tier, overSoftLimit };
}

/**
 * Trust değerlendirmesini uygular: User.trustScore/tier günceller ve gerekiyorsa
 * feedback'i işaretler. Tek yerde, idempotent ve hata-toleranslı.
 */
export async function applyTrustEvaluation(
  feedbackId: string,
  input: TrustInput
): Promise<TrustEvaluation> {
  const evaluation = await evaluateTrustOnFeedback(input);

  await Promise.all([
    prisma.user.update({
      where: { id: input.userId },
      data: {
        trustScore: evaluation.newScore,
        trustTier: evaluation.tier,
        trustUpdatedAt: new Date(),
      },
    }),
    evaluation.flagged
      ? prisma.feedback.update({
          where: { id: feedbackId },
          data: { trustFlagged: true, trustReason: evaluation.reason },
        })
      : Promise.resolve(null),
  ]);

  return evaluation;
}
