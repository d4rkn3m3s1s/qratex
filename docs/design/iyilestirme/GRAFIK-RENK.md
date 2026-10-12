# Grafik ve durum renk sistemi (2026-10-12)

Yöntem: `dataviz` becerisi (biçim → renk işi → validate_palette → işaret → ipucu → erişilebilirlik).

## Kategorik palet (`--category-1..8`, app/globals.css)
Sıra = renk körü güvenliği; değiştirmeyin. Seri rengi varlığa bağlanır, sıraya değil; 8+ seri "Diğer"e katlanır. Saçılım/çok-panelde ilk 3 slot.

| # | Ton | Açık | Koyu |
|---|---|---|---|
| 1 | mavi | #2a78d6 | #3987e5 |
| 2 | turuncu | #eb6834 | #d95926 |
| 3 | akuamarin | #1baf7a | #199e70 |
| 4 | sarı | #eda100 | #c98500 |
| 5 | macenta | #e87ba4 | #d55181 |
| 6 | yeşil | #008300 | #008300 |
| 7 | mor | #6250d6 | #9085e9 |
| 8 | kırmızı | #e34948 | #e66767 |

Doğrulama (`validate_palette.js`, yüzeyler: açık #ffffff, koyu kart #0e1320):
- Açık: TÜM KONTROLLER GEÇTİ — bitişik CVD ΔE 9.1, normal görüş ΔE 19.6; 3 slot (aqua/sarı/macenta) <3:1 → görünür etiket/tablo görünümü zorunlu (ChartFrame tablo sağlıyor).
- Koyu: TÜM KONTROLLER GEÇTİ — CVD ΔE 8.4, normal 19.3, hepsi ≥3:1. İlk 3 slot tüm-çiftlerde de geçer.
- Önceki palet (mor/gök/zümrüt/kehribar/gül/camgöbeği/turuncu/fuşya) açıkta ve koyuda Lightness band FAIL veriyordu.

## Sıralı / ayrışan
- `--chart-seq-lo/hi` tek ton mavi; `chartSequentialColor(t)` (oklab color-mix). Koyu temada adımlar ters (koyu→açık = az→çok).
- `--chart-div-neg/mid/pos` kırmızı ↔ nötr gri ↔ mavi; `chartDivergingColor(v)`, v∈[-1,1].
- Isı haritaları (admin etkinlik, müşteri alışkanlık, bayi gün×saat) marka-alfa yerine sıralı palete; bayi puan haritası durum yeşil/kırmızısı yerine ayrışan palete geçti (durum renkleri veri kutbu için kullanılmaz).

## Durum tonları (zemin/metin/sınır)
`components/states/tone.ts` TONE_CHIP → `bg-*-subtle text-*(=*-text) ring-*-border`, her zaman ikon+etiket. Ölçülen metin kontrastı (AA ≥4.5):
| ton | açık metin/zemin | koyu metin/zemin |
|---|---|---|
| success | 5.53 | 8.44 |
| warning | 6.11 | 9.20 |
| danger | 5.67 | 5.98 |
| info | 6.08 | 7.95 |
Sınırlar dekoratif (anlam ikon+etikette).

## Grafik kromu (`components/ds/data/chart-theme.ts`)
- ızgara `border-subtle`, eksen tik `text-3` 11px, efsane `text-2` 12px.
- İpucu: `surface-2` kutu; etiket `text-1`, öğe metni `text-2` (seri renginde metin yok). `chartTooltipProps` hazır.
- Çubuk ucu `barRadius` 4px. Donut dilimleri arası 2px kart rengi boşluk.
- Tüm recharts bileşenleri (admin analitik/AI kalite/AI operasyon, bayi analitik/anket/kampanya/kıyas/etki, components/charts/*) bu token'lara bağlı; ham hex yok.
- Sparkline/MetricTile zaten `TONE_TEXT` + currentColor → tutarlı.

## Kalanlar
- Birkaç grafik çift Y ekseni kullanıyor (a-analitik trend, b-kiyas-etki ziyaret/ciro) — beceriye göre anti-desen; iki küçük grafiğe bölünmeli (ürün kararı).
- `lib/chart-palette.ts` CHART_HEX yalnız OG görselleri/arka plan efektleri/tema presetlerinde kullanılıyor (grafik değil).
- Ekran görüntüleri: `.wf-tmp/shots/grafik/` (bayi analitik/yoğunluk/etki, AI kalite, müşteri ilerleme; 390/1440 açık+koyu). admin.json oturumu süresi dolmuş → /admin/analytics girişe düştü; çerez bandı bazı karelerde grafiği örtüyor.
