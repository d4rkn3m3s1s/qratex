/**
 * QDL v2 bileşen kiti — kök barrel. Kılavuz: components/ds/README.md
 *
 *   import { PanelPage, PageHeader, MetricTile, DataTable, Form, TextField, IconButton, PointsChip } from '@/components/ds';
 *
 * Katmanlar (her biri kendi barrel'ından da alınabilir — `@/components/ds/<katman>`):
 *  - `page`  → sayfa iskeleti, başlık, araç/filtre çubuğu, sekmeler, dönem seçici, URL durumu
 *  - `data`  → metrik kutusu, tablo, detay paneli, durum rozetleri, zaman çizelgesi, grafik çerçevesi
 *  - `form`  → RHF + zod form, alanlar, editör paneli, kirli çubuk, sunucu hata eşleme
 *  - `a11y`  → ikon buton, puanlama, çip seçimi, fotoğraf seçici, tam ekran modal, canlı bölge
 *  - `play`  → puan çipi, XP halkası, seri alevi, ödül ilerlemesi, rozet/nadirlik, lig amblemi, `Ambient`
 *
 * Durum bileşenleri (QueryState, EmptyState, ErrorState, ConfirmAction, iskeletler) burada
 * DEĞİL, `@/components/states`'te; hareket token'ları `@/lib/motion`'da.
 *
 * İsim çakışması: `ISTANBUL_TZ` hem `page` hem `play` barrel'ında var ama tek bağlamadır
 * (`play/istanbul-time` onu `page/date-range`'den yeniden dışa aktarır), bu yüzden
 * `export *` belirsizlik üretmez. Yeni dışa aktarımda katmanlar arası aynı adı vermeyin;
 * gerekiyorsa katman önekli ad kullanın (ör. form'daki `DateRangeFieldValue`
 * ↔ page'deki `DateRangeValue`).
 *
 * Not: recharts bu barrel'dan yüklenmez; grafikler `lazyChart(() => import(…))` ile gelir.
 */
export * from './page';
export * from './data';
export * from './form';
export * from './a11y';
export * from './play';
