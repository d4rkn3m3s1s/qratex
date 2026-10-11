/**
 * AnalyticsEvent tablosu için saklama süresi ve temizlik yardımcıları.
 *
 * EKONOMİ / SAHTEKÂRLIK İZİ SİLİNMEZ (mimari-api B3/B11, puan ekonomisi değişmezi): `points_credited`
 * defteri güven merkezi hız/tavan dedektörlerinin, rozet "gerçekten yatan puan" geçmişinin ve
 * haftalık kazanç özetlerinin kaynağıdır. Eskiden bu yardımcı TÜM olayları siliyordu; yönetici
 * ucu (`/api/admin/analytics/cleanup-events`) 1 güne kadar inebildiği için tek istekle sahtekârlık
 * izi yok edilebiliyordu ve `cron/db-cleanup`'ın "ekonomi verisi silinmez" kuralıyla çelişiyordu.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** Varsayılan saklama: 90 günden eski (korunmayan) event'ler temizlenebilir. */
export const DEFAULT_RETENTION_DAYS = 90;

/** Elle temizlikte inilebilecek en kısa saklama süresi (gün). */
export const MIN_RETENTION_DAYS = 30;

/** Saklama temizliğinin ASLA silmediği olaylar (ekonomi defteri + sahtekârlık sinyalleri). */
export const RETAINED_ANALYTICS_EVENTS: ReadonlyArray<string> = [
  'points_credited',
  'points_spent',
  'coupon_redeemed',
  'game_attempt_flagged',
];

/** Saklama süresi gün sayısını [MIN_RETENTION_DAYS, 365] aralığına kırpar. */
export function clampRetentionDays(days: number | null | undefined): number {
  const n = typeof days === 'number' && Number.isFinite(days) ? Math.floor(days) : DEFAULT_RETENTION_DAYS;
  return Math.min(365, Math.max(MIN_RETENTION_DAYS, n));
}

/** Temizlenebilir olaylar: kesim tarihinden eski VE korunan listede olmayan. */
export function retentionWhere(olderThanDays: number, now: Date = new Date()): Prisma.AnalyticsEventWhereInput {
  const cutoff = new Date(now.getTime() - clampRetentionDays(olderThanDays) * 86_400_000);
  return { createdAt: { lt: cutoff }, event: { notIn: [...RETAINED_ANALYTICS_EVENTS] } };
}

/**
 * Belirtilen günden eski (korunmayan) AnalyticsEvent kayıtlarını siler.
 * @returns Silinen kayıt sayısı.
 */
export async function deleteAnalyticsEventsOlderThan(
  olderThanDays: number = DEFAULT_RETENTION_DAYS
): Promise<number> {
  const result = await prisma.analyticsEvent.deleteMany({ where: retentionWhere(olderThanDays) });
  return result.count;
}

/** Silinecek (retention dışı, korunmayan) event sayısını döner (silme yapmaz). */
export async function countAnalyticsEventsOlderThan(
  olderThanDays: number = DEFAULT_RETENTION_DAYS
): Promise<number> {
  return prisma.analyticsEvent.count({ where: retentionWhere(olderThanDays) });
}
