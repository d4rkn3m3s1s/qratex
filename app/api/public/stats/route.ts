import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getPublicStats } from '@/lib/landing/public-stats';
import { PUBLIC_STATS_THRESHOLDS } from '@/lib/landing/public-stats-core';

export const dynamic = 'force-dynamic';

const CACHE_SECONDS = 300;

/**
 * GET /api/public/stats — herkese açık vitrin rakamları (girdi almaz, yalnız toplam sayı;
 * PII yok). Ana sayfa aynı veriyi sunucuda `getPublicStats()` ile okur; bu uç cron
 * cache-warm ve harici tüketiciler için. Denetim düzeltmeleri (landing.md Bulgu 3-4):
 *  - `users` artık yalnız gerçek tüketici hesapları (eskiden admin/bayi/personel dahil).
 *  - Silinen ve demo geri bildirimler sayılmaz.
 *  - Veri yoksa ortalama UYDURULMAZ: `rating: null` (+ geriye uyum için `ratingAvailable`).
 *  - Hata "200 + sıfır/4.9" değil, 503 + yeniden denenebilir hata zarfı.
 * Eski alan adları (`users`, `businesses`, `feedbacks`, `rating`) korunur.
 */
export async function GET() {
  const stats = await getPublicStats();
  if (!stats) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        error: 'İstatistikler şu an hesaplanamıyor. Lütfen biraz sonra tekrar deneyin.',
        retryable: true,
      },
      { status: 503, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': '60' } }
    );
  }

  return NextResponse.json(
    {
      users: stats.members,
      businesses: stats.businesses,
      feedbacks: stats.feedbacks,
      // Geriye uyum: eski istemciler sayı bekliyor; ortalama yoksa 0 + `ratingAvailable: false`.
      rating: stats.rating ?? 0,
      ratingAvailable: stats.rating !== null,
      v: 2,
      members: stats.members,
      feedbacksLast30d: stats.feedbacksLast30d,
      ratingCount: stats.ratingCount,
      computedAt: stats.computedAt,
      thresholds: PUBLIC_STATS_THRESHOLDS,
    },
    {
      headers: {
        'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
      },
    }
  );
}
