/**
 * `GET /api/dealer/benchmark` — EMEKLİ (yerine `GET /api/dealer/analytics/benchmark`).
 *
 * Eski uç her bayi için 43 sorgu çalıştırıyor, hata olunca uydurma "üst %50" dönüyor ve akran
 * kartında tek bir rakibin puanını sızdırabiliyordu (denetim B2/B5/B6). Tek kalan tüketici, emekliye
 * ayrılmakta olan eski ısı haritası sayfasının "komşu segment" kartı (`bm.benchmark.neighborSegment`).
 * Ona kırılmadan boş segment döner (kart gizlenir; denetim önerisi zaten kartın kaldırılması);
 * akran istatistiği yalnız yeni uçta, k-anonimlik ≥ 5 ile verilir.
 */
import { defineRoute, ok } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.benchmark.legacy',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'benchmark',
    rateLimit: 'read',
  },
  () =>
    ok(
      { benchmark: { neighborSegment: null }, deprecated: true, replacement: '/api/dealer/analytics/benchmark' },
      { legacySpread: true, headers: { Deprecation: 'true', Link: '</api/dealer/analytics/benchmark>; rel="successor-version"' } }
    )
);
