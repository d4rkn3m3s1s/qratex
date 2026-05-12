/**
 * AnalyticsEvent tablosu için saklama süresi ve temizlik yardımcıları.
 * Eski kayıtları silmek veya arşivlemek için kullanılabilir.
 */

import { prisma } from '@/lib/prisma';

/** Varsayılan saklama: 90 günden eski event'ler temizlenebilir. */
export const DEFAULT_RETENTION_DAYS = 90;

/**
 * Belirtilen günden eski AnalyticsEvent kayıtlarını siler.
 * Cron job veya admin API'den çağrılabilir.
 * @param olderThanDays Bu günden eski kayıtlar silinir (varsayılan 90).
 * @returns Silinen kayıt sayısı.
 */
export async function deleteAnalyticsEventsOlderThan(
  olderThanDays: number = DEFAULT_RETENTION_DAYS
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.analyticsEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

/**
 * Silinecek (retention dışı) event sayısını döner (silme yapmaz).
 */
export async function countAnalyticsEventsOlderThan(
  olderThanDays: number = DEFAULT_RETENTION_DAYS
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  return prisma.analyticsEvent.count({
    where: { createdAt: { lt: cutoff } },
  });
}
