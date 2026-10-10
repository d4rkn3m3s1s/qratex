# `components/ds` — QDL v2 bileşen kiti

Üç panelin (admin, bayi, müşteri) ortak bileşen katmanı. Kaynak: yol haritası §4.1–4.2
(`docs/audit/2026-10-08/00-YOL-HARITASI.md`) ve `docs/audit/2026-10-08/sistem/tasarim-sistemi.md`.
Her katmanın ayrıntılı kılavuzu kendi klasöründeki `README.md`'dedir.

```ts
import { PanelPage, PageHeader, MetricTile, DataTable, Form, TextField, IconButton, PointsChip } from '@/components/ds';
// ya da katman barrel'ı: '@/components/ds/page' | '/data' | '/form' | '/a11y' | '/play'
```

| Katman | İçerik | Ayrıntı |
|---|---|---|
| `page` | Sayfa iskeleti, başlık, araç/filtre çubuğu, sekmeler, dönem seçici, URL durumu | [page/README.md](page/README.md) |
| `data` | Metrik kutusu, tablo, detay paneli, durum rozetleri, zaman çizelgesi, grafik çerçevesi | [data/README.md](data/README.md) |
| `form` | RHF + zod form, alanlar, editör paneli, kirli çubuk, sunucu hata eşleme | [form/README.md](form/README.md) |
| `a11y` | İkon buton, puanlama, çip seçimi, fotoğraf seçici, tam ekran modal, canlı bölge | [a11y/README.md](a11y/README.md) |
| `play` | Puan çipi, XP halkası, seri alevi, ödül ilerlemesi, rozet ve nadirlik, lig amblemi, geri sayım, `Ambient` | [play/README.md](play/README.md) |

Kit dışında kalan iki komşu katman var. Durum bileşenleri (`QueryState`, `EmptyState`, `ErrorState`,
`ConfirmAction`, iskeletler, `Tone`) `@/components/states`'te durur. Hareket token'ları, `useMotionPolicy` ve
varyantlar `@/lib/motion`'dadır. Kit bunları kopyalamaz, üstüne kurar.

## Hangi durumda hangi bileşen

| İhtiyaç | Kullan | Kullanma |
|---|---|---|
| Sayfa çerçevesi (başlık, araç çubuğu, içerik, yan panel) | `PanelPage` + `PageHeader` + `PageGrid` | Elle `max-w-*`/`space-y-*` iskeleti |
| Filtre, arama, dönem (URL'de kalıcı) | `FilterBar` + `useFilterState`; dönem için alan tipi `dateRange` | `useState` filtresi (yenilemede kaybolur) |
| Tek başına dönem seçimi (rapor, grafik) | `DateRangePicker` (`page`), sunucuya `toPeriod()` | `DateRangeField` (o bir form alanı) |
| Form içinde tarih aralığı | `DateRangeField` (`form`) | `DateRangePicker` |
| Sekmeli bölüm, sekme URL'de | `SectionTabs` | Radix `Tabs`'ı doğrudan kullanmak |
| Bölüm kartı | `SectionCard` (`page`) | Elle `rounded border p-*` |
| Tek sayı + değişim + mini grafik | `MetricTile` / `MetricGrid` (sunucu `MetricValue` verir) | Yeni kodda `states/StatTile` (eski API) |
| Liste/tablo (sayfalama, sıralama, toplu işlem, mobil kart) | `DataTable` + `useUrlTableState` | Elle `<table>` + `map` |
| Satır detayı (`?id=` derin linki) | `DetailSheet` + `useDetailSheet` | Ayrı detay sayfası açan modal |
| Durum/önem etiketi | `StatusBadge` / `SeverityBadge` (`defineStatusMap`) | Renkli `<span>` (yalnız renge dayanır) |
| Anahtar–değer, olay akışı | `KeyValueList`, `Timeline` | |
| Grafik | `ChartFrame` + `lazyChart(() => import(…))` | recharts'ı doğrudan statik import etmek |
| Yükleme / hata / boş / yetkisiz | `QueryState` (`@/components/states`), panel çökmesi için `PanelErrorBoundary` | `isLoading ? <Spinner/>` zincirleri |
| Kayıt düzenleme/oluşturma paneli | `EntityEditorSheet` (yükleme kapısı, kirli kapanış onayı, 409) | Yükleme bitmeden form açmak |
| Uzun sayfa formu | `Form` + alanlar + `DirtyBar` | |
| Para / sayı girişi | `MoneyField` (tam sayı kuruş), `NumberField` (`1,5` ve `1.5`) | `type="number"` + `parseFloat` |
| Yıkıcı işlem onayı | `ConfirmAction` (`@/components/states`) | `window.confirm` |
| Yalnız ikonlu buton | `IconButton` (`aria-label` tipte zorunlu) | Etiketsiz `<Button size="icon">` |
| Puan / yıldız / NPS | `RatingInput` | |
| Tekli/çoklu seçim çipleri | `ChoiceChips` | Elle toggle butonları |
| Fotoğraf yükleme | `PhotoPicker` (küçültme, EXIF temizliği) | Ham `<input type="file">` |
| Mobil tam ekran akış | `FullscreenModal` | |
| Ekran okuyucuya duyuru | `announce()` / `useAnnouncer` / `LiveRegion` | |
| Bakiye, XP, seri, ödül ilerlemesi | `PointsChip`, `XpRing`, `StreakFlame`, `RewardProgress` | Sayfaya özel sayaçlar |
| Rozet, nadirlik, lig | `BadgeGlyph`, `RarityBadge`, `LeagueEmblem` | |
| Günlük/haftalık sıfırlama sayacı | `CountdownChip` (İstanbul gece yarısı / Pazartesi 00:00) | Yerel saatle hesaplamak |
| Vurgulu kart (ödül, oyun) | `GlowCard` | Ops yüzeyinde glow |
| Sonsuz dekoratif animasyon | `Ambient` (play'de; görünmezken ve azaltılmış harekette durur) | Çıplak `repeat: Infinity` |

## İki ifade kaydı: `ops` ve `play`

| | `ops` (sakin) | `play` (ifadeli) |
|---|---|---|
| Nerede | Admin, bayi, personel; müşteride cüzdan, ayarlar, geçmiş, yasal, auth | Müşteri ana sayfa vurguları, oyunlar, rozet, kutu, seviye/lig anları |
| Yüzey | `surface-1` düz kart, ince kenarlık, elevation ≤ 1 | Cam, marka kenarı/gradient, elevation 2–3, glow |
| Hareket | `fast`/`base` geçişler; sonsuz döngü yok | Spring, `celebrate`; döngüler yalnız `<Ambient>` içinde |

Kayıt şu sırayla çözülür:

1. Bileşenin `register` prop'u.
2. En yakın `RegisterProvider`. `PanelPage register="…"` bunu kendisi kurar; içteki `SectionCard`, `MetricTile`,
   a11y ve play bileşenleri ayrıca `register` almaz.
3. Varsayılan: ops ve a11y bileşenlerinde `ops`. Play bileşenleri `[data-register]` atasına bakar, o da yoksa `play` olur.

Aynı API iki kayıtta da çalışır. Örneğin `GlowCard register="ops"` düz karta düşer, `ops` kaydında `Ambient` hiç
çalışmaz. Kayıt yalnız görünümü değiştirir; davranış ve erişilebilirlik aynı kalır.

## Herkes için geçerli kurallar

- **Renk:** yalnız rol token'ları kullanılır (`bg-surface-*`, `text-fg*`, `border-strong`, `brand*`,
  `{success|warning|danger|info}-*`, `ring-focus`). Ham Tailwind paleti (`bg-purple-500` vb.) kullanılmaz.
  Açık/koyu tema ve erişilebilirlik modları kendiliğinden uygulanır.
- **Erişilebilirlik:** her etkileşimli öğenin rolü, adı ve görünür odak halkası olur. Durum yalnız renkle değil,
  ikon ve metinle de anlatılır. Mobilde dokunma hedefi ≥ 44px'tir; `touchTarget` prop'u masaüstünde de 44px yapar.
- **Hareket:** süre ve easing `@/lib/motion` token'larından gelir. Azaltılmış harekette (OS tercihi ya da
  `html.reduce-animations`) her şey statik kalır. Framer için `import { m } from 'framer-motion'` (global LazyMotion).
- **Dil:** metinler TR/EN'dir ve uygulama dilini (`useDsLocale`) izler. `AppLocaleProvider` yoksa `tr` kullanılır.
  Play bileşenleri `locale` prop'uyla dili ezebilir.
- **Zaman:** gün sınırları `Europe/Istanbul`'a göredir (`ISTANBUL_TZ`, `istanbulDay`, `toPeriod`).
  `toISOString().slice(0, 10)` kullanılmaz.
- **Ad çakışması:** katmanlar arasında aynı dışa aktarım adı kullanılmaz. Gerekirse katman önekli ad verilir
  (form `DateRangeFieldValue` ↔ page `DateRangeValue`).

## Örnek sayfa iskeleti (ops)

```tsx
'use client';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  PanelPage, PageHeader, PageGrid, FilterBar, SectionCard, SectionTabs, PanelErrorBoundary,
  MetricGrid, MetricTile, DataTable, DetailSheet, useDetailSheet,
  useFilterState, useUrlTableState, toPeriod,
  type FilterField, type DateRangeValue,
} from '@/components/ds';
import { QueryState } from '@/components/states';

const FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Ara' },
  { type: 'dateRange', key: 'period', label: 'Dönem', defaultPreset: 'last30' },
];

export default function OrdersPage() {
  const filters = useFilterState(FIELDS);
  const table = useUrlTableState({ defaultSort: [{ id: 'createdAt', desc: true }] });
  const sheet = useDetailSheet();
  const period = toPeriod(filters.values.period as DateRangeValue);
  const summary = useQuery({ queryKey: ['orders-summary', period], queryFn: () => fetchSummary(period) });
  const list = useQuery({
    queryKey: ['orders', table.params, filters.values],
    queryFn: () => fetchOrders({ ...table.params, ...filters.values, period }),
    placeholderData: keepPreviousData,
  });

  return (
    <PanelPage
      register="ops"
      header={<PageHeader title="Siparişler" description="Son siparişler ve durumları" />}
      toolbar={<FilterBar fields={FIELDS} />}
    >
      <QueryState query={summary}>
        {(s) => (
          <MetricGrid cols={4}>
            <MetricTile label="Ciro" metric={s.revenue} />
            <MetricTile label="Sipariş" metric={s.count} />
          </MetricGrid>
        )}
      </QueryState>

      <SectionCard title="Liste">
        <PanelErrorBoundary>
          <DataTable
            ariaLabel="Siparişler"
            columns={columns}
            data={list.data?.items}
            query={list}
            getRowId={(r) => r.id}
            manualPagination manualSorting
            rowCount={list.data?.total}
            {...table}
            onRowClick={(r) => sheet.open(r.id)}
            activeRowId={sheet.id}
          />
        </PanelErrorBoundary>
      </SectionCard>

      <DetailSheet title={(id) => `Sipariş #${id}`}>{(id) => <OrderDetail id={id} />}</DetailSheet>
    </PanelPage>
  );
}
```

Play yüzeyi için iskelet aynıdır: `register="play"` verilir, `GlowCard`, `PointsChip`, `RewardProgress` gibi play
bileşenleri eklenir. Dekoratif döngüler `<Ambient>` içine konur.

## Notlar

- `useSearchParams` kullanan bileşenler (`FilterBar`, `SectionTabs`, `DetailSheet`) kendi `Suspense` sınırlarını
  kurar. Kancaları (`useFilterState`, `useUrlTableState`, `useDetailSheet`) doğrudan çağıran sayfa kendi
  `Suspense` sınırını eklemelidir (Next 16).
- Grafik kütüphanesi kök barrel'dan yüklenmez; `ChartFrame` + `lazyChart` ile isteğe bağlı gelir.
- Yeni bileşen eklerken: tipli props, gerekiyorsa `forwardRef`, katmanın `index.ts`'ine dışa aktarım ve katman
  README'sine kısa bir örnek eklenir. Tip denetimi şöyle yapılır:
  `node <scratchpad>/tsc-check.mjs components/ds` (ya da yalnız `components/ds`'i kapsayan bir tsconfig).
