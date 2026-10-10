# `components/ds/data`: QDL veri katmanı

KPI, tablo, detay çekmecesi, rozet, zaman çizelgesi ve grafik çerçevesi. Durumlar (`loading`, `error`, `empty`, `stale`) her zaman `components/states` → `QueryState` üzerinden gösterilir. Hata hiçbir zaman boş liste gibi görünmez.

| Bileşen | Özet |
|---|---|
| `MetricTile` / `MetricGrid` | `MetricValue` sözleşmesine göre biçimler (`number`, `currency`, `percent`, `duration`). `DeltaBadge`, `Sparkline`, `n = 42` notu ve düşük örneklem uyarısı içerir. Yüklenirken iskelet gösterir |
| `DeltaBadge` | Yön oku, `+`/`−` işareti, iyi/kötü rengi ve ekran okuyucu cümlesini birlikte verir; anlam yalnız renge bırakılmaz. `goodDirection: 'down'` destekler |
| `Sparkline` | Saf SVG; recharts kullanmaz. Değer `null` olan noktada çizgide boşluk kalır. `label` verilmezse dekoratif sayılır |
| `DataTable` | TanStack üstüne kurulu. Sunucu tarafında sayfalama, sıralama ve filtre; Shift ile aralık seçimi ve toplu işlem çubuğu; sütun görünürlüğü; mobilde kart görünümü |
| `DetailSheet` / `useDetailSheet` | `?id=` derin linkli yan çekmece. Radix Dialog üzerine kurulu, mobilde alttan açılır. Önceki/sonraki kayda geçiş vardır |
| `StatusBadge` / `SeverityBadge` | İkon ve metin birlikte gösterilir. `defineStatusMap` ve `statusBadgeProps` ile tip güvenli durum sözlüğü kurulur |
| `KeyValueList` | `<dl>` yapısında. Düzen `inline`, `stacked` ya da `grid` olabilir. Değer boşsa "—" gösterir. Kopyala düğmesi vardır |
| `Timeline` | `<ol>` ve `<time>` kullanır; saatler Europe/Istanbul'a göre gösterilir. Olaylar güne göre gruplanabilir |
| `ChartFrame` / `lazyChart` | recharts'ı lazy yükler ve yer ayırır. Hata olursa tabloya düşer. Grafik `aria-hidden` işaretlidir; aynı veri erişilebilir tablo olarak sunulur |

## MetricTile

```tsx
import { MetricGrid, MetricTile, type MetricValue } from '@/components/ds/data';

// Sunucu hesaplar (sayıyı kod hesaplar), istemci yalnız biçimler:
const revenue: MetricValue = {
  value: 182450, format: 'currency', currency: 'TRY',
  delta: { value: 12.4, kind: 'percent', label: 'önceki 30 güne göre' },
  series: [120, 140, null, 160, 182], n: 412,
};

<MetricGrid cols={4}>
  <MetricTile label="Ciro" metric={revenue} icon={<Wallet />} tone="brand" href="/dealer/reports/revenue" />
  <MetricTile label="Şikâyet" metric={{ value: 7, delta: { value: -30, goodDirection: 'down' } }} />
  <MetricTile label="Ort. puan" metric={{ value: 4.6, n: 9, minN: 30 }} hint="Son 30 gün" />   {/* "Düşük örneklem" */}
  <MetricTile label="Ort. süre" metric={{ value: 3725, format: 'duration' }} />             {/* "1 sa 2 dk" */}
  <MetricTile label="Dönüşüm" metric={{ value: 18.2, format: 'percent', delta: { value: 1.5, kind: 'points' } }} />
  <MetricTile label="Puan" metric={…} register="play" loading={q.isLoading} />
</MetricGrid>
```

`percent` biçiminde değer yüzde olarak verilir (`12.5` → `%12,5`); oran (`0.125`) verilmez.

## DataTable: sunucu sayfalama, URL durumu ve detay çekmecesi

```tsx
'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, DetailSheet, StatusBadge, statusBadgeProps, defineStatusMap, useDetailSheet, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { useFilterState } from '@/components/ds/page';

const STATUS = defineStatusMap({
  PAID: { label: 'Ödendi', tone: 'success' },
  PENDING: { label: 'Bekliyor', tone: 'warning' },
  REFUNDED: { label: 'İade', tone: 'neutral' },
});

const columns: ColumnDef<Order>[] = [
  { accessorKey: 'customer', header: 'Müşteri', meta: { mobile: 'title' } satisfies DataTableColumnMeta },
  { accessorKey: 'createdAt', header: 'Tarih', meta: { mobile: 'subtitle' }, cell: ({ getValue }) => fmtDate(getValue<string>()) },
  { accessorKey: 'total', header: 'Tutar', meta: { numeric: true }, cell: ({ getValue }) => fmtTRY(getValue<number>()) },
  { accessorKey: 'status', header: 'Durum', enableSorting: false, cell: ({ getValue }) => <StatusBadge {...statusBadgeProps(STATUS, getValue<string>())} size="sm" /> },
  { id: 'actions', header: '', enableHiding: false, meta: { mobile: 'actions', interactive: true, label: 'İşlemler' }, cell: ({ row }) => <RowMenu order={row.original} /> },
];

export function OrdersTable() {
  const filters = useFilterState(FIELDS);
  const table = useUrlTableState({ defaultSort: [{ id: 'createdAt', desc: true }], sortableIds: ['createdAt', 'total', 'customer'] });
  const sheet = useDetailSheet();
  const q = useQuery({
    queryKey: ['orders', table.params, filters.values],
    queryFn: () => fetchOrders({ ...table.params, ...filters.values }),
    placeholderData: keepPreviousData,                 // sayfa geçişinde eski satırlar + "Güncelleniyor"
  });

  return (
    <>
      <DataTable
        ariaLabel="Siparişler"
        columns={columns}
        data={q.data?.items}
        query={q}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.customer}
        manualPagination manualSorting manualFiltering
        rowCount={q.data?.total}
        {...table}                                    // pagination, sorting ve on*Change (URL'de)
        filtered={filters.activeCount > 0}
        enableRowSelection
        bulkActions={({ ids, clear }) => <Button size="sm" onClick={() => exportOrders(ids).then(clear)}>Dışa aktar</Button>}
        onRowClick={(r) => sheet.open(r.id)}
        activeRowId={sheet.id}
      />
      <DetailSheet
        title={(id) => `Sipariş #${id}`}
        siblings={q.data?.items.map((r) => r.id)}
        footer={(id) => <Button onClick={() => refund(id)}>İade et</Button>}
      >
        {(id) => <OrderDetail id={id} />}  {/* kendi useQuery + QueryState'i */}
      </DetailSheet>
    </>
  );
}
```

- İstemci tarafı tablo (≤ 100 satır): `manual*` ve `rowCount` verilmez; sıralama, filtre ve sayfalama tarayıcıda yapılır.
- Satır tıklaması `Enter` ve `Space` ile de çalışır. Hücredeki `a`, `button` ve `[data-row-click-ignore]` öğeleri satır tıklamasını tetiklemez.
- Mobilde varsayılan kırılım `cardBreakpoint="md"` noktasıdır. Bunun altında kart listesi gösterilir. Kartın düzeni sütun `meta.mobile` değerinden gelir (`title`, `subtitle`, `field`, `actions`, `hidden`). Özel çizim için `renderCard` verilir.
- Sanal kaydırma yoktur; satırlar memo'lu olduğu için 100 satıra kadar akıcıdır. Yoğun tabloda stagger animasyonu kullanılmaz.

## Rozetler, anahtar–değer listesi ve zaman çizelgesi

```tsx
<StatusBadge label="Aktif" tone="success" />            // ikon: CheckCircle2
<StatusBadge label="Taslak" tone="neutral" icon={null} />
<SeverityBadge severity="critical" emphasize />         // "Önem: Kritik" (ekran okuyucu)
<SeverityBadge severity={toSeverity(alert.level)} size="sm" />

<KeyValueList
  items={[
    { label: 'Müşteri no', value: c.id, copyValue: c.id, mono: true },
    { label: 'E-posta', value: c.email },
    { label: 'Son ziyaret', value: null },               // "—"
  ]}
/>
<KeyValueList layout="grid" columns={3} items={…} />

<Timeline
  groupByDay
  events={audit.map((a) => ({ id: a.id, at: a.createdAt, title: a.action, actor: a.actorName, tone: a.ok ? 'success' : 'danger' }))}
/>
```

## ChartFrame (recharts yalnız lazy)

```tsx
// revenue-chart.tsx: recharts YALNIZ bu dosyada
'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_THEME, chartSeriesColor } from '@/components/ds/data/chart-theme';
export default function RevenueChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
        <XAxis dataKey="day" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} />
        <YAxis tick={CHART_THEME.tick} stroke={CHART_THEME.grid} />
        <Tooltip contentStyle={CHART_THEME.tooltipStyle} cursor={{ fill: CHART_THEME.cursor }} />
        <Area dataKey="total" stroke={chartSeriesColor(0)} fill={chartSeriesColor(0, 0.15)} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// sayfa
const RevenueChart = lazyChart(() => import('./revenue-chart'));   // modül seviyesinde
<ChartFrame
  title="Günlük ciro"
  summary="Ciro son 30 günde %12 arttı"
  data={rows}
  columns={[{ key: 'day', label: 'Gün' }, { key: 'total', label: 'Ciro', numeric: true, format: (v) => fmtTRY(v as number) }]}
  query={q}
  height={260}
>
  <RevenueChart data={rows} />
</ChartFrame>
```

Grafik görünür alana yaklaşınca yüklenir (`deferUntilVisible`). Yüklenirken aynı yükseklikte iskelet durur, böylece CLS oluşmaz. Ops kaydında recharts animasyonunu `isAnimationActive={false}` ile kapatın.

## Kayıtlar (ops / play)

- **ops** (varsayılan): `surface-1`, elevation 1, tabular sayılar, `fast/base` geçişler, stagger yok.
- **play**: `MetricTile register="play"` display yazı ve elevation 2 kullanır; sparkline bir kez çizilerek girer. `Timeline animate` ilk 12 öğeyi bütçeli kademeyle getirir. Azaltılmış harekette bu efektlerin hepsi kapanır (`useMotionPolicy`).

## Test edilebilir saf modüller

`metric-format.ts`, `sparkline-geometry.ts`, `table-url.ts`, `status-meta.ts` ve `chart-theme.ts`.
