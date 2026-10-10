/**
 * QR yaşam döngüsü kota kuralları (F12 / P0-14: rotate ve `revoke:false` kotayı atlatıyordu).
 *
 * Değişmez (invariant): bir bayinin CANLI QR sayısı (iptal edilmemiş + arşivlenmemiş)
 * planının `maxQRCodes` limitini hiçbir yaşam döngüsü işlemiyle AŞAMAZ.
 *  - Rotate: aynı transaction'da 1 iptal + 1 oluşturma → canlı sayı değişmez (kota-nötr).
 *  - İptali geri alma (`revoke:false`): canlı sayıyı 1 artırır → kota kontrolünden geçmeli.
 *    Eskiden kontrol yoktu: rotate → eskiyi geri aç → döngü = sınırsız canlı kod.
 *
 * Kontrol + yazım aynı transaction'da, bayi başına advisory kilit altında yapılır
 * (iki paralel "geri aç" isteği limiti birlikte aşamaz). Yeni QR oluşturan uçlar da
 * aynı kilidi (`lockDealerQrQuota`) kullanabilir.
 */
import type { Prisma } from '@prisma/client';
import { getDealerPlanLimits } from '@/lib/plan-limits';

type Tx = Prisma.TransactionClient;

/** Kota tüketen canlı QR filtresi: iptal edilmemiş ve arşivlenmemiş. */
export function liveQrWhere(dealerId: string): Prisma.QRCodeWhereInput {
  return { dealerId, revokedAt: null, archivedAt: null };
}

/** Bayinin QR kota işlemlerini transaction süresince sıraya sokar. */
export async function lockDealerQrQuota(tx: Tx, dealerId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`qr-quota:${dealerId}`}))`;
}

export interface QrQuotaVerdict {
  allowed: boolean;
  live: number;
  limit: number | null;
  planName: string;
  reason?: string;
}

/**
 * Canlı QR sayısını `delta` kadar artıracak bir işlem plana sığar mı?
 * `tx` içinde ve `lockDealerQrQuota` sonrasında çağrılmalıdır.
 */
export async function checkLiveQrQuota(tx: Tx, dealerId: string, delta = 1): Promise<QrQuotaVerdict> {
  const limits = await getDealerPlanLimits(dealerId);
  if (limits.maxQRCodes == null) {
    return { allowed: true, live: 0, limit: null, planName: limits.planName };
  }
  const live = await tx.qRCode.count({ where: liveQrWhere(dealerId) });
  const allowed = live + delta <= limits.maxQRCodes;
  return {
    allowed,
    live,
    limit: limits.maxQRCodes,
    planName: limits.planName,
    reason: allowed
      ? undefined
      : `"${limits.planName}" planınızda en fazla ${limits.maxQRCodes} etkin QR kodu olabilir (şu an ${live}). Bu kodu yeniden etkinleştirmek için başka bir kodu iptal edin ya da planınızı yükseltin.`,
  };
}

/** İptali geri alma kotaya takıldığında fırlatılır; route 402 + PLAN_LIMIT_REACHED döner. */
export class QrQuotaExceededError extends Error {
  constructor(readonly verdict: QrQuotaVerdict) {
    super(verdict.reason ?? 'Plan limitine ulaşıldı');
    this.name = 'QrQuotaExceededError';
  }
}
