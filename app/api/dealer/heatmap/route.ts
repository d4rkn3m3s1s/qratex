/**
 * GET /api/dealer/heatmap — Bayi Analitik → Yoğunluk BFF'i (b-analitik).
 *
 * Eski uç `HeatmapData` kovasını (UTC, geri bildirim + tüketim karışık, dönemsiz) okuyor,
 * satırları Pazartesi=0 üretip arayüzde Pazar=0 etiketiyle basıyordu (bir gün kayma) ve
 * yalnız `getServerSession` + DEALER kontrolüyle, modül kapısı olmadan açıktı. Şimdi:
 *  - `defineRoute`: rol + kiracı + zod + hız sınırı + `heatmap` modül kapısı (rapor Bulgu 10).
 *  - Kovalar olay tablolarından, dönemle, `AT TIME ZONE 'Europe/Istanbul'` ile; gün anahtarı
 *    `mon…sun` (sayısal etiket yok). Metrik: geri bildirim / ziyaret / ciro / ortalama puan.
 *  - Şube (DealerLocation) → QR iki seviyeli kırılım; "en iyi/dikkat" Bayes + asgari örneklem.
 */
import { defineRoute, ok, ApiError } from '@/lib/http/define-route';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { heatmapQuerySchema, parseHeatmapSearch } from '@/lib/dealer-analytics/params';
import { loadActivityHeatmap } from '@/lib/dealer-analytics/load';

export const dynamic = 'force-dynamic';

const FRESH_LIMIT = { max: 6, windowMs: 60_000 } as const;

export const GET = defineRoute(
  {
    name: 'dealer.analytics.heatmap',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'heatmap',
    rateLimit: 'read',
    query: heatmapQuerySchema,
  },
  async ({ query, tenant, user, request }) => {
    let fresh = false;
    if (query.fresh === '1') {
      const rl = await checkRateLimitDb(`dealer-heatmap:fresh:${user.id}`, FRESH_LIMIT.max, FRESH_LIMIT.windowMs);
      if (!rl.ok) {
        throw new ApiError('RATE_LIMITED', 'Çok sık yenilediniz. Lütfen bir dakika sonra tekrar deneyin.', {
          retryable: true,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.retryAfterMs ?? FRESH_LIMIT.windowMs) / 1000))) },
        });
      }
      fresh = true;
    }
    const q = parseHeatmapSearch(request.nextUrl.searchParams);
    return ok(await loadActivityHeatmap(tenant.dealerId, q, { fresh }));
  }
);
