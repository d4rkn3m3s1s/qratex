'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { AlertTriangle, Gauge, ListChecks, Shuffle, Star, Target, TimerReset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ChartFrame,
  DataTable,
  DetailSheet,
  MetricGrid,
  MetricTile,
  StatusBadge,
  lazyChart,
  statusBadgeProps,
  useDetailSheet,
  useUrlTableState,
  type DataTableColumnMeta,
} from '@/components/ds/data';
import { FilterBar, SectionCard, useFilterState, useUrlState, type FilterField } from '@/components/ds/page';
import { ConfirmAction, ErrorState } from '@/components/states';
import {
  INTENT_LABEL,
  QUALITY_ALERT_THRESHOLD,
  QUALITY_PAGE_SIZE,
  SAMPLE_STATUSES,
  SAMPLE_STATUS_LABEL,
  SENTIMENT_LABEL,
  intentLabel,
  sampleQsFromUrl,
  sentimentLabel,
  type Paged,
  type QualityMetrics,
  type SampleListItem,
} from '@/lib/ai-quality/contract';
import { errorText, fetchSamples, qualityKeys, runSampling } from './api';
import { SAMPLE_STATUS, fmtDateTime, fmtDay, fmtNumber, fmtRelative, scoreTone } from './format';
import { ReviewPanel } from './review-panel';
import type { TrendRow } from './quality-trend-chart';

const QualityTrendChart = lazyChart(() => import('./quality-trend-chart'));

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function fields(models: readonly string[]): FilterField[] {
  return [
    { type: 'search', key: 'q', label: 'Ara', placeholder: 'Yorum metni, işletme ya da QR adı', minLength: 2 },
    {
      type: 'select',
      key: 'status',
      label: 'Durum',
      allLabel: null,
      defaultValue: 'pending',
      options: [...SAMPLE_STATUSES.map((s) => ({ value: s, label: SAMPLE_STATUS_LABEL[s] })), { value: 'all', label: 'Tümü' }],
    },
    { type: 'select', key: 'model', label: 'Model', allLabel: 'Tüm modeller', options: [...models.map((m) => ({ value: m, label: m })), { value: '__none', label: 'Model bilgisi yok' }] },
    { type: 'select', key: 'sentiment', label: 'Duygu', allLabel: 'Tüm duygular', options: Object.entries(SENTIMENT_LABEL).map(([value, label]) => ({ value, label })) },
    { type: 'select', key: 'intent', label: 'Niyet', allLabel: 'Tüm niyetler', options: Object.entries(INTENT_LABEL).map(([value, label]) => ({ value, label })) },
  ];
}

type Props = {
  metrics: UseQueryResult<QualityMetrics>;
  initialList: { qs: string; page: Paged<SampleListItem> } | null;
};

export function ReviewTab({ metrics, initialList }: Props) {
  const qc = useQueryClient();
  const m = metrics.data;
  const FIELDS = useMemo(() => fields(m?.models ?? []), [m?.models]);
  const filters = useFilterState(FIELDS);
  const table = useUrlTableState({ defaultPageSize: QUALITY_PAGE_SIZE });
  const sheet = useDetailSheet('id');
  const status = str(filters.values.status) || 'pending';
  const { get } = useUrlState();
  const qs = sampleQsFromUrl(get);
  const list = useQuery({
    queryKey: qualityKeys.samples(qs),
    queryFn: ({ signal }) => fetchSamples(qs, signal),
    initialData: initialList && initialList.qs === qs ? initialList.page : undefined,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const ids = useMemo(() => list.data?.items.map((r) => r.id) ?? [], [list.data]);
  const [running, setRunning] = useState(false);

  const onDone = (next: boolean) => {
    const cur = sheet.id;
    const idx = cur ? ids.indexOf(cur) : -1;
    const nextId = next && idx >= 0 ? ids[idx + 1] : null;
    if (nextId) sheet.open(nextId);
    else if (next) sheet.close();
  };

  const run = async () => {
    setRunning(true);
    try {
      const r = await runSampling({ size: 50, days: 7 });
      toast.success(
        r.created
          ? `${r.created} yeni örnek eklendi (${r.strata} katman, ${fmtNumber(r.candidates)} aday).`
          : `Uygun yeni yorum yok (${fmtNumber(r.candidates)} aday). Son 7 günde LLM ile analiz edilmiş, örneklenmemiş yorum kalmamış.`
      );
      if (r.voided) toast.message(`${r.voided} bekleyen örnek, yorum silindiği ya da analiz LLM dışı olduğu için geçersiz sayıldı.`);
      await qc.invalidateQueries({ queryKey: qualityKeys.all });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setRunning(false);
    }
  };

  const columns = useMemo<ColumnDef<SampleListItem>[]>(
    () => [
      {
        id: 'text',
        header: 'Yorum',
        enableSorting: false,
        enableHiding: false,
        meta: { mobile: 'title', label: 'Yorum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const f = row.original.feedback;
          return (
            <div className="min-w-[14rem] max-w-[28rem] space-y-0.5">
              <p className="line-clamp-2 text-sm text-fg">{f.preview || <span className="text-fg-muted">Metin yok</span>}</p>
              <p className="truncate text-xs text-fg-muted">
                {[f.dealerName, f.qrName].filter(Boolean).join(' · ') || '—'}
                {row.original.isDemo ? ' · demo' : ''}
              </p>
            </div>
          );
        },
      },
      {
        id: 'rating',
        header: 'Puan',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Puan' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
            {row.original.feedback.rating}
            <span className="sr-only"> / 5 yıldız</span>
          </span>
        ),
      },
      {
        id: 'ai',
        header: 'AI çıktısı',
        enableSorting: false,
        meta: { mobile: 'field', label: 'AI çıktısı' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const f = row.original.feedback;
          return (
            <div className="space-y-0.5 text-sm">
              <p>
                {sentimentLabel(f.sentiment)} · {intentLabel(f.intent)}
              </p>
              <p className="truncate font-mono text-xs text-fg-muted">{f.model ?? 'model bilinmiyor'}</p>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge {...statusBadgeProps(SAMPLE_STATUS, r.status)} size="sm" />
              {r.accuracyScore != null ? <StatusBadge label={`%${r.accuracyScore}`} tone={scoreTone(r.accuracyScore)} icon={null} size="sm" /> : null}
            </div>
          );
        },
      },
      {
        id: 'when',
        header: 'Örnekleme / inceleme',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Zaman' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-xs text-fg-muted">
              <p>{fmtDateTime(r.createdAt)}</p>
              {r.reviewedAt ? (
                <p>
                  {fmtRelative(r.reviewedAt)}
                  {r.reviewer?.name ? ` · ${r.reviewer.name}` : ''}
                </p>
              ) : null}
            </div>
          );
        },
      },
    ],
    []
  );

  const trend: TrendRow[] = (m?.weekly ?? []).map((w) => ({ label: fmtDay(w.week), avg: w.avg, n: w.n }));
  const cur = m?.current;
  const prev = m?.previous;
  const delta = cur?.avg != null && prev?.avg != null ? Math.round((cur.avg - prev.avg) * 10) / 10 : null;

  return (
    <div className="space-y-6">
      {metrics.isError && !m ? (
        <ErrorState title="Kalite metrikleri alınamadı" description={errorText(metrics.error)} onRetry={() => metrics.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile
            label="Bu haftaki doğruluk"
            icon={<Gauge />}
            tone="brand"
            loading={metrics.isLoading}
            metric={{
              value: cur?.avg ?? null,
              format: 'percent',
              n: cur?.n ?? 0,
              minN: 10,
              delta: delta != null ? { value: delta, kind: 'points', label: 'geçen haftaya göre' } : null,
              series: m?.weekly.map((w) => w.avg) ?? null,
            }}
            sparklineLabel="Son 12 haftanın ortalama doğruluğu"
            hint="İstanbul haftası; demo bayi ve LLM dışı analizler hariç"
          />
          <MetricTile
            label="İnceleme oranı"
            icon={<ListChecks />}
            loading={metrics.isLoading}
            metric={{ value: m?.reviewRate.value ?? null, format: 'percent', n: m?.reviewRate.n ?? 0 }}
            hint="Son 4 haftada açılan örneklerden karara bağlananlar"
          />
          <MetricTile
            label="Bekleyen örnek"
            icon={<TimerReset />}
            tone={m && m.counts.pending > 0 ? 'warning' : 'neutral'}
            loading={metrics.isLoading}
            metric={{ value: m?.counts.pending ?? null }}
            hint={`${fmtNumber(m?.counts.reviewed)} incelendi · ${fmtNumber(m?.counts.skipped)} atlandı · ${fmtNumber(m?.counts.void)} geçersiz`}
          />
          <MetricTile
            label={m?.weakest ? `En zayıf alan: ${m.weakest.label}` : 'En zayıf alan'}
            icon={<Target />}
            tone={m?.weakest && m.weakest.accuracy < QUALITY_ALERT_THRESHOLD ? 'danger' : 'neutral'}
            loading={metrics.isLoading}
            metric={{ value: m?.weakest?.accuracy ?? null, format: 'percent' }}
            hint={m?.weakest ? 'Alan bazlı kararlardan, son 12 hafta' : 'Bir alanda en az 5 karar gerekli'}
          />
        </MetricGrid>
      )}

      {m?.alert ? (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-fg">
          <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden />
          Bu haftaki ortalama doğruluk %{m.alert.avg} ({m.alert.n} örnek): %{QUALITY_ALERT_THRESHOLD} eşiğinin altında. Model ve alan kırılımına bakın.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartFrame
          className="lg:col-span-2"
          title="Haftalık doğruluk"
          description="Son 12 hafta, incelenen örneklerin ortalama skoru. Kesikli çizgi uyarı eşiği."
          summary={cur?.avg != null ? `Bu hafta ortalama %${cur.avg}, ${cur.n} örnek.` : 'Bu hafta henüz incelenen örnek yok.'}
          data={trend}
          columns={[
            { key: 'label', label: 'Hafta' },
            { key: 'avg', label: 'Ortalama', numeric: true, format: (v) => (v == null ? '—' : `%${v}`) },
            { key: 'n', label: 'Örnek', numeric: true },
          ]}
          query={metrics}
          height={240}
          empty={{ title: 'Henüz değerlendirme yok', description: 'İlk örnekleri değerlendirdiğinizde eğilim burada görünür.' }}
        >
          <QualityTrendChart data={trend} />
        </ChartFrame>

        <SectionCard title="Kırılım" description="Model ve alan bazında doğruluk (son 12 hafta)">
          {m ? (
            <div className="space-y-4 text-sm">
              <table className="w-full">
                <caption className="sr-only">Model bazında doğruluk</caption>
                <thead>
                  <tr className="text-left text-xs text-fg-muted">
                    <th scope="col" className="pb-1 font-medium">Model</th>
                    <th scope="col" className="pb-1 text-right font-medium">Ort.</th>
                    <th scope="col" className="pb-1 text-right font-medium">n</th>
                  </tr>
                </thead>
                <tbody>
                  {m.byModel.length ? (
                    m.byModel.map((r) => (
                      <tr key={r.model} className="border-t border-border">
                        <td className="max-w-[10rem] truncate py-1.5 font-mono text-xs">{r.model}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.avg == null ? '—' : `%${r.avg}`}</td>
                        <td className="py-1.5 text-right tabular-nums text-fg-muted">{r.n}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-2 text-fg-muted">Veri yok</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <table className="w-full">
                <caption className="sr-only">Alan bazında doğruluk</caption>
                <thead>
                  <tr className="text-left text-xs text-fg-muted">
                    <th scope="col" className="pb-1 font-medium">Alan</th>
                    <th scope="col" className="pb-1 text-right font-medium">Doğruluk</th>
                    <th scope="col" className="pb-1 text-right font-medium">n</th>
                  </tr>
                </thead>
                <tbody>
                  {m.byField.map((r) => (
                    <tr key={r.field} className="border-t border-border">
                      <td className="py-1.5">{r.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.accuracy == null ? '—' : `%${r.accuracy}`}</td>
                      <td className="py-1.5 text-right tabular-nums text-fg-muted">{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-fg-muted">{metrics.isLoading ? 'Yükleniyor…' : 'Kırılım alınamadı.'}</p>
          )}
        </SectionCard>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg-muted">
          {m?.lastRun ? (
            <>
              Son örnekleme <strong className="text-fg">{fmtRelative(m.lastRun.at)}</strong> ({fmtDateTime(m.lastRun.at)}) · {m.lastRun.created} örnek ·{' '}
              {m.lastRun.actor ? `elle: ${m.lastRun.actor}` : 'haftalık otomatik iş'}
            </>
          ) : (
            'Henüz kayıtlı bir örnekleme yok. Haftalık iş her Pazar çalışır; isterseniz şimdi başlatın.'
          )}
        </p>
        <ConfirmAction
          title="Şimdi örnekle"
          description="Son 7 günün LLM ile analiz edilmiş, henüz örneklenmemiş yorumlarından duygu × niyet katmanlarına göre en çok 50 rastgele örnek eklenir. Demo bayiler ve sezgisel analizler dahil edilmez."
          tone="brand"
          confirmLabel="Örneklemeyi başlat"
          irreversibleNote={false}
          onConfirm={run}
          trigger={
            <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={running}>
              <Shuffle className="h-4 w-4" aria-hidden />
              Şimdi örnekle
            </Button>
          }
        />
      </div>

      <FilterBar fields={FIELDS} />

      <DataTable
        ariaLabel="AI kalite örnekleri"
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.feedback.preview.slice(0, 60) || 'Örnek'}
        manualPagination
        rowCount={list.data?.total}
        pagination={table.pagination}
        onPaginationChange={table.onPaginationChange}
        filtered={filters.activeCount > 0}
        onRowClick={(r) => sheet.open(r.id)}
        activeRowId={sheet.id}
        empty={
          status === 'pending' && filters.activeCount === 0
            ? { title: 'Bekleyen örnek yok', description: 'Kuyruk temiz. Yeni örnekler haftalık işle ya da "Şimdi örnekle" ile gelir.' }
            : { title: 'Bu filtreyle örnek yok', description: 'Filtreleri değiştirip tekrar deneyin.' }
        }
      />

      <DetailSheet paramKey="id" size="xl" title="Örneği değerlendir" description="Yorumu okuyun, AI çıktısını alan alan değerlendirin." siblings={ids}>
        {(id) => <ReviewPanel id={id} onDone={onDone} />}
      </DetailSheet>
    </div>
  );
}
