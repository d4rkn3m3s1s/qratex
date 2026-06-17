/**
 * HeatmapData kayıt yardımcı — bir olay (tüketim/feedback) olduğunda ilgili
 * (dealer, tarih, saat) kovasını artırır. Önceden ısı haritası okuma anında
 * son 500 kayıttan SENTEZLENİYORDU (yoğun bayilerde eksik sayım). Artık her olay
 * kalıcı HeatmapData'ya yazılır; okuma tam geçmişten gelir.
 *
 * dayOfWeek ham getDay() (Pazar=0 .. Cmt=6) — şema konvansiyonu. Okuma tarafı
 * gösterim için TR-locale'e (Pzt=0) çevirir.
 *
 * Ateşle-unut: çağıran await etmek zorunda değil; hata yutulur (ana akışı bozmaz).
 */
import { prisma } from '@/lib/prisma';

function dateOnlyUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function recordHeatmapHit(
  dealerId: string,
  when: Date = new Date(),
  revenue = 0
): Promise<void> {
  try {
    const date = dateOnlyUTC(when);
    const hour = when.getUTCHours();
    const dayOfWeek = when.getUTCDay();
    await prisma.heatmapData.upsert({
      where: { dealerId_date_hour: { dealerId, date, hour } },
      update: {
        count: { increment: 1 },
        ...(revenue > 0 ? { revenue: { increment: revenue } } : {}),
      },
      create: { dealerId, date, hour, dayOfWeek, count: 1, revenue: revenue > 0 ? revenue : 0 },
    });
  } catch (err) {
    console.error('[HEATMAP_TRACK] kova güncellenemedi:', err);
  }
}
