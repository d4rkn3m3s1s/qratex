import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * Dealer heatmap API.
 *
 * ÖNEMLİ (sözleşme düzeltmesi): Sayfa (`app/dealer/heatmap/page.tsx`) şu şekli bekler:
 *   { heatmap: HeatmapRow[], period, timeHeatmap: number[][] (7x24), summary }
 * Eski sürüm yalnızca { data, empty } döndürüyordu; `if (hm.heatmap)` her zaman false
 * olduğu için sayfa hep boş/hatalı görünüyordu. Artık sayfanın beklediği şekli üretiyoruz:
 *   - timeHeatmap: 7x24 gün/saat yoğunluk gridi (HeatmapData → fallback: son olaylar)
 *   - heatmap: QR kod (lokasyon) bazında geri bildirim/puan agregasyonu
 *   - summary: toplamlar + en iyi/en aktif lokasyon + zirve saat
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'DEALER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const dealerId = session.user.id;

    // 7x24 grid (TR-locale: 0 = Pazartesi .. 6 = Pazar).
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const toTrDay = (rawDay: number) => (rawDay === 0 ? 6 : rawDay - 1);

    // --- 1) Zaman gridi (timeHeatmap) ---
    const rows = await prisma.heatmapData.findMany({
      where: { dealerId },
      select: { dayOfWeek: true, hour: true, count: true },
    });

    if (rows.length > 0) {
      for (const r of rows) {
        const d = toTrDay(r.dayOfWeek);
        if (d >= 0 && d < 7 && r.hour >= 0 && r.hour < 24) grid[d][r.hour] += r.count;
      }
    } else {
      // Cold start: son kayıtlardan sentezle (fallback).
      const [consumptions, feedbacks] = await Promise.all([
        prisma.consumption.findMany({
          where: { dealerId },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        prisma.feedback.findMany({
          where: { qrCode: { dealerId } },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ]);
      for (const event of [...consumptions, ...feedbacks]) {
        const date = new Date(event.createdAt);
        grid[toTrDay(date.getUTCDay())][date.getUTCHours()] += 1;
      }
    }

    // Zirve saat (grid üzerinden).
    let peak = { hour: 0, dayOfWeek: 0, count: 0 };
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (grid[d][h] > peak.count) peak = { hour: h, dayOfWeek: d, count: grid[d][h] };
      }
    }

    // --- 2) Lokasyon (QR kod) bazında agregasyon (heatmap[]) ---
    // Bu bayinin QR kodları + her birine bağlı geri bildirimlerin puan/adet özeti.
    const qrCodes = await prisma.qRCode.findMany({
      where: { dealerId },
      select: {
        id: true,
        name: true,
        location: { select: { name: true } },
        feedbacks: {
          where: { deletedAt: null },
          select: { rating: true },
        },
      },
    });

    const heatmap = qrCodes
      .map((qr) => {
        const ratings = qr.feedbacks.map((f) => f.rating).filter((r): r is number => typeof r === 'number');
        const feedbackCount = ratings.length;
        const positiveCount = ratings.filter((r) => r >= 4).length;
        const negativeCount = ratings.filter((r) => r <= 2).length;
        const avgRating = feedbackCount > 0 ? ratings.reduce((a, b) => a + b, 0) / feedbackCount : 0;
        // Memnuniyet skoru: pozitiflerin oranı (0-100).
        const satisfactionScore = feedbackCount > 0 ? Math.round((positiveCount / feedbackCount) * 100) : 0;
        return {
          qrCodeId: qr.id,
          locationName: qr.location?.name || qr.name || 'Konumsuz',
          avgRating: Math.round(avgRating * 10) / 10,
          feedbackCount,
          positiveCount,
          negativeCount,
          satisfactionScore,
        };
      })
      .sort((a, b) => b.feedbackCount - a.feedbackCount);

    // --- 3) Özet (summary) ---
    const totalFeedbacks = heatmap.reduce((sum, r) => sum + r.feedbackCount, 0);
    const withFeedback = heatmap.filter((r) => r.feedbackCount > 0);
    const bestLocation = withFeedback.length
      ? [...withFeedback].sort((a, b) => b.avgRating - a.avgRating)[0]
      : null;
    const mostActiveLocation = withFeedback.length ? withFeedback[0] : null;

    const summary = {
      totalLocations: heatmap.length,
      totalFeedbacks,
      bestLocation: bestLocation
        ? { name: bestLocation.locationName, avgRating: bestLocation.avgRating, feedbackCount: bestLocation.feedbackCount }
        : null,
      mostActiveLocation: mostActiveLocation
        ? { name: mostActiveLocation.locationName, feedbackCount: mostActiveLocation.feedbackCount }
        : null,
      peakHour: peak,
    };

    return NextResponse.json(
      { heatmap, period: 'all', timeHeatmap: grid, summary },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('[HEATMAP_API_ERROR]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
