'use client';

/**
 * Bayi Analitik → Yoğunluk (istemci adası). Eski `/dealer/heatmap` buraya katlandı.
 *
 * Sorular (yeniden tasarım vizyonu): "Ne zaman yoğunuz?" — "O saatlerde kalite tutuyor mu?" —
 * "Hangi şube/nokta dikkat istiyor?" Üstte süzgeç (dönem + karşılaştırma, şube, metrik; URL'de),
 * altında üç içgörü, tam genişlik gün × saat ızgarası (hücre → ayrıntı çekmecesi), en altta
 * şube → QR kırılımı. Komşu segment kartı kaldırıldı (konu dışı + ağır benchmark ucu; Bulgu 8).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Clock, MapPin } from 'lucide-react';
import { BarChart3, Table2 } from 'lucide-react';
import { ChartDataTable, DeltaBadge, DetailSheet, KeyValueList, useDataCopy, type ChartColumn } from '@/components/ds/data';
import { FilterBar, PageHeader, PageToolbar, PanelPage, SectionCard, formatDayRange, type FilterField } from '@/components/ds/page';
import { EmptyState, InlineError, QueryState, SkeletonStats, TONE_CALLOUT, TONE_CHIP, type Tone } from '@/components/states';
import { cn } from '@/lib/utils';
import { cellCompareValue, cellValue, relDeltaPct } from '@/lib/dealer-analytics/core';
import { csvFileName, gridCsv, locationsCsv } from '@/lib/dealer-analytics/csv';
import { WEEKDAYS, heatmapQueryKey, type ActivityHeatmap, type HeatmapMetric, type Weekday } from '@/lib/dealer-analytics/types';
import { formatCurrency, formatNumber, formatPercent, formatRating, localeTag, useAnalyticsCopy, useAnalyticsLocale, weekdayLabel } from './copy';
import { LocationBreakdown } from './location-breakdown';
import { ExportMenu, RefreshButton, UpdatedAt, type ExportItem } from './toolbar-actions';
import { fetchHeatmap, useActivityHeatmap, useFreshRefresh, useHeatmapQueryFromUrl } from './use-analytics';
import { WeekHourGrid, useCellFormatter, type GridSelection } from './week-hour-grid';

const PRESETS = ['last7', 'last30', 'last90', 'thisMonth', 'lastMonth', 'thisYear'] as const;

function useHeatmapFields(data: ActivityHeatmap | undefined): FilterField[] {
  const copy = useAnalyticsCopy();
  const locations = data?.filters.locations;
  const visits = data?.availability.visits ?? true;
  const revenue = data?.availability.revenue ?? true;
  return useMemo(() => {
    const fields: FilterField[] = [
      { type: 'dateRange', key: 'period', label: copy.period, defaultPreset: 'last30', defaultCompare: 'previous', presets: PRESETS, maxDays: 366 },
    ];
    if (locations && locations.length > 0) {
      fields.push({
        type: 'select',
        key: 'location',
        label: copy.location,
        allLabel: copy.allLocations,
        options: [...locations.map((l) => ({ value: l.id, label: l.name })), { value: 'none', label: copy.noLocation }],
      });
    }
    fields.push({
      type: 'select',
      key: 'metric',
      label: copy.metric,
      allLabel: null,
      defaultValue: 'feedback',
      options: [
        { value: 'feedback', label: copy.metrics.feedback },
        { value: 'visits', label: copy.metrics.visits, disabled: !visits },
        { value: 'revenue', label: copy.metrics.revenue, disabled: !revenue },
        { value: 'rating', label: copy.metrics.rating },
      ],
    });
    return fields;
  }, [copy, locations, visits, revenue]);
}

function InsightCard({ icon, tone, title, children }: { icon: ReactNode; tone: Tone; title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3 rounded-card border border-subtle bg-surface-1 p-4 qx-elevation-1">
      <span aria-hidden className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-control [&_svg]:h-4 [&_svg]:w-4', TONE_CHIP[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="qx-caption font-medium text-fg-muted">{title}</h2>
        <div className="mt-0.5 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function Insights({ data }: { data: ActivityHeatmap }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const fmt = useCellFormatter(data.filters.metric);
  const { peak, qualityDip, attentionLocation } = data.insights;
  const metric = data.filters.metric;
  const peakDelta = peak && peak.compareValue != null && metric !== 'rating' ? relDeltaPct(peak.value, peak.compareValue) : null;
  const peakCell = peak ? data.rows.find((r) => r.day === peak.day)?.cells[peak.hour] : null;

  return (
    <div className="grid min-w-0 gap-3 sm:gap-4 md:grid-cols-3">
      <InsightCard icon={<Clock />} tone="brand" title={copy.peakWindow}>
        {peak && peakCell ? (
          <>
            <p className="qx-small font-semibold text-fg">
              {weekdayLabel(peak.day, locale)} {copy.hourRange(peak.hour)}
            </p>
            <p className="qx-caption flex flex-wrap items-center gap-2 text-fg-muted">
              <span className="tabular-nums">{fmt(peakCell)}</span>
              {peakDelta != null && <DeltaBadge delta={{ value: peakDelta, kind: 'percent', goodDirection: 'neutral' }} size="sm" label={copy.vsPrevShort} />}
            </p>
          </>
        ) : (
          <p className="qx-small text-fg-subtle">{copy.needsData(data.insights.minN)}</p>
        )}
      </InsightCard>
      <InsightCard icon={<AlertTriangle />} tone="warning" title={copy.qualityDip}>
        {qualityDip ? (
          <>
            <p className="qx-small font-semibold text-fg">
              {weekdayLabel(qualityDip.day, locale)} {copy.hourRange(qualityDip.hour)}
            </p>
            <p className="qx-caption tabular-nums text-fg-muted">
              {copy.qualityDipBody(formatRating(qualityDip.avgRating, locale), formatRating(qualityDip.baseline, locale), formatNumber(qualityDip.n, locale))}
            </p>
          </>
        ) : (
          <p className="qx-small text-fg-subtle">{copy.noQualityDip}</p>
        )}
      </InsightCard>
      <InsightCard icon={<MapPin />} tone="danger" title={copy.attentionLocation}>
        {attentionLocation ? (
          <>
            <p className="qx-small truncate font-semibold text-fg">{attentionLocation.name ?? copy.unassigned}</p>
            <p className="qx-caption tabular-nums text-fg-muted">
              {copy.attentionLocationBody(formatRating(attentionLocation.bayesRating, locale), formatNumber(attentionLocation.feedbacks, locale))}
            </p>
          </>
        ) : (
          <p className="qx-small text-fg-subtle">{copy.noAttentionLocation}</p>
        )}
      </InsightCard>
    </div>
  );
}

function CellDetail({ data, sel }: { data: ActivityHeatmap; sel: GridSelection }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const row = data.rows.find((r) => r.day === sel.day);
  const cell = row?.cells[sel.hour];
  if (!cell) return null;
  const hasCompare = data.query.compare !== 'none';
  const share = data.totals.feedback > 0 ? (cell.feedback / data.totals.feedback) * 100 : null;
  const cmp = (cur: number, prev: number | null) => {
    if (!hasCompare || prev == null) return null;
    const d = relDeltaPct(cur, prev);
    return (
      <span className="qx-caption text-fg-muted tabular-nums">
        {copy.cellCompare}: {formatNumber(prev, locale)}
        {d != null && (
          <>
            {' '}
            <DeltaBadge delta={{ value: d, kind: 'percent', goodDirection: 'neutral' }} size="sm" label={null} />
          </>
        )}
      </span>
    );
  };
  return (
    <KeyValueList
      layout="stacked"
      items={[
        {
          label: copy.cellFeedback,
          value: (
            <span className="flex flex-col gap-0.5">
              <span className="tabular-nums">{formatNumber(cell.feedback, locale)}</span>
              {cmp(cell.feedback, cell.compareFeedback)}
            </span>
          ),
        },
        { label: copy.cellAvg, value: cell.avgRating == null ? null : `${formatRating(cell.avgRating, locale)}★` },
        { label: copy.cellNegative, value: formatNumber(cell.negative, locale) },
        ...(data.availability.visits
          ? [
              {
                label: copy.cellVisits,
                value: (
                  <span className="flex flex-col gap-0.5">
                    <span className="tabular-nums">{formatNumber(cell.visits, locale)}</span>
                    {cmp(cell.visits, cell.compareVisits)}
                  </span>
                ),
              },
            ]
          : []),
        ...(data.availability.revenue ? [{ label: copy.cellRevenue, value: formatCurrency(cell.revenue, locale) }] : []),
        { label: copy.cellShare, value: share == null ? null : formatPercent(share, locale, 1) },
      ]}
    />
  );
}

/** Grafik ↔ tablo görünümü (ızgaranın erişilebilir tablo karşılığı; rapor B-9). */
function ViewToggle({ view, onChange }: { view: 'chart' | 'table'; onChange: (v: 'chart' | 'table') => void }) {
  const dcopy = useDataCopy();
  return (
    <div role="group" aria-label={dcopy.viewAs} className="inline-flex rounded-control border border-subtle bg-surface-muted p-0.5">
      {(['chart', 'table'] as const).map((v) => {
        const Icon = v === 'chart' ? BarChart3 : Table2;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => onChange(v)}
            className={cn(
              'qx-caption inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-chip px-2.5 font-medium transition-colors duration-fast ease-standard sm:h-8',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              view === v ? 'bg-surface-1 text-fg qx-elevation-1' : 'text-fg-muted hover:text-fg',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">{v === 'chart' ? dcopy.chartView : dcopy.tableView}</span>
          </button>
        );
      })}
    </div>
  );
}

function HeatmapContent({ data }: { data: ActivityHeatmap }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const [sel, setSel] = useState<GridSelection | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const metric: HeatmapMetric = data.filters.metric;
  const metricLabel = copy.metrics[metric];
  const baseline = data.totals.avgRating;
  const fmtCell = useCellFormatter(metric);
  const total = metric === 'visits' ? data.totals.visits : metric === 'revenue' ? data.totals.revenue : data.totals.feedback;

  const siblings = useMemo(() => {
    const ids: string[] = [];
    for (const r of data.rows) for (const c of r.cells) ids.push(`${r.day}-${c.hour}`);
    return ids;
  }, [data.rows]);

  type TableRow = { day: Weekday } & Record<string, unknown>;
  const tableRows: TableRow[] = useMemo(
    () =>
      data.rows.map((r) => {
        const o: TableRow = { day: r.day };
        for (const c of r.cells) o[`h${c.hour}`] = c;
        return o;
      }),
    [data.rows],
  );
  const columns: ChartColumn<TableRow>[] = useMemo(
    () => [
      { key: 'day', label: copy.colDay, format: (v) => weekdayLabel(v as Weekday, locale) },
      ...Array.from({ length: 24 }, (_, h) => ({
        key: `h${h}`,
        label: copy.hourShort(h),
        numeric: true,
        format: (v: unknown) => {
          const c = v as (typeof data.rows)[number]['cells'][number];
          const val = cellValue(c, metric);
          if (val == null) return '—';
          return metric === 'rating' ? formatRating(val, locale) : metric === 'revenue' ? formatCurrency(val, locale) : formatNumber(val, locale);
        },
      })),
    ],
    [copy, locale, metric, data],
  );

  if (total === 0 && metric !== 'rating' && data.totals.feedback === 0) {
    return <EmptyState compact headingLevel="h2" title={copy.emptyPeriodTitle} description={copy.emptyPeriodDescription} />;
  }

  const selCell = sel ? data.rows.find((r) => r.day === sel.day)?.cells[sel.hour] : null;
  const selCompare = selCell ? cellCompareValue(selCell, metric) : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Insights data={data} />
      <SectionCard
        title={copy.gridTitle(metricLabel)}
        description={copy.gridDescription}
        headingLevel="h2"
        actions={<ViewToggle view={view} onChange={setView} />}
        footer={<span className="qx-caption text-fg-subtle">{copy.tzNote}</span>}
      >
        {view === 'table' ? (
          <div className="-mx-1 overflow-x-auto px-1">
            <ChartDataTable data={tableRows} columns={columns} caption={copy.gridLabel(metricLabel)} />
          </div>
        ) : (
          <WeekHourGrid rows={data.rows} metric={metric} baseline={baseline} selected={sel} onSelect={setSel} label={copy.gridLabel(metricLabel)} />
        )}
      </SectionCard>
      <LocationBreakdown data={data} />
      <DetailSheet
        open={!!sel}
        onOpenChange={(o) => {
          if (!o) setSel(null);
        }}
        id={sel ? `${sel.day}-${sel.hour}` : null}
        siblings={siblings}
        onNavigate={(id) => {
          const [d, h] = id.split('-');
          if ((WEEKDAYS as readonly string[]).includes(d)) setSel({ day: d as Weekday, hour: Number(h) });
        }}
        size="sm"
        title={sel ? copy.cellTitle(weekdayLabel(sel.day, locale), copy.hourRange(sel.hour)) : ''}
        description={selCell ? `${metricLabel}: ${fmtCell(selCell)}${selCompare != null ? ` · ${copy.cellCompare}: ${metric === 'revenue' ? formatCurrency(selCompare, locale) : formatNumber(selCompare, locale)}` : ''}` : undefined}
      >
        {sel ? <CellDetail data={data} sel={sel} /> : null}
      </DetailSheet>
    </div>
  );
}

export function ActivityHeatmapScreen() {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const q = useHeatmapQueryFromUrl();
  const query = useActivityHeatmap(q);
  const data = query.data;
  const fields = useHeatmapFields(data);
  const key = useMemo(() => heatmapQueryKey(q), [q]);
  const fresh = useFreshRefresh(key, () => fetchHeatmap(q, { fresh: true }));
  const updating = query.isPlaceholderData || (query.isFetching && !query.isLoading);

  const exportItems: ExportItem[] = useMemo(() => {
    if (!data) return [];
    const { from, to } = data.query.range;
    return [
      {
        key: 'grid',
        label: copy.exportCsvGrid,
        csv: () => ({
          fileName: csvFileName('yogunluk', from, to),
          content: gridCsv(
            data,
            [copy.colDay, 'Saat', copy.cellFeedback, copy.cellAvg, copy.cellNegative, copy.cellVisits, copy.cellRevenue, `${copy.cellCompare} (${copy.cellFeedback})`],
            (d) => weekdayLabel(d, locale),
          ),
        }),
      },
      {
        key: 'locations',
        label: copy.exportCsvLocations,
        csv: data.locations.length
          ? () => ({
              fileName: csvFileName('subeler', from, to),
              content: locationsCsv(
                data,
                [copy.location, copy.qrName, copy.cellFeedback, copy.cellAvg, copy.sentiments.positive, copy.sentiments.neutral, copy.sentiments.negative, copy.sentiments.pending],
                copy.unassigned,
              ),
            })
          : null,
      },
    ];
  }, [data, copy, locale]);

  const metricNotice =
    data && data.filters.metric !== q.metric
      ? copy.metricFallback
      : data && q.location && (q.metric === 'visits' || q.metric === 'revenue')
        ? copy.noVisits
        : null;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title={copy.heatmapTitle}
          description={copy.heatmapDescription}
          meta={<UpdatedAt iso={data?.generatedAt} />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <RefreshButton onRefresh={fresh.refresh} pending={fresh.pending} disabled={!data} />
              <ExportMenu items={exportItems} disabled={!data} />
            </div>
          }
        />
      }
      toolbar={
        <PageToolbar sticky ariaLabel={copy.filtersLabel} summary={updating ? copy.updating : formatDayRange(q.range, localeTag(locale))}>
          <FilterBar fields={fields} ariaLabel={copy.filtersLabel} />
        </PageToolbar>
      }
    >
      {metricNotice && (
        <p className={cn('qx-small rounded-control border px-3 py-2', TONE_CALLOUT.info)} role="note">
          {metricNotice}
        </p>
      )}
      {data && !data.availability.revenue && data.availability.visits && q.metric === 'revenue' && (
        <p className={cn('qx-small rounded-control border px-3 py-2', TONE_CALLOUT.neutral)} role="note">
          {copy.noRevenue}
        </p>
      )}
      {fresh.error != null && (
        <InlineError variant="banner" onRetry={fresh.refresh}>
          {fresh.error instanceof Error && fresh.error.message ? fresh.error.message : copy.refreshFailed}
        </InlineError>
      )}
      <div aria-busy={updating || undefined} className={cn('transition-opacity duration-base ease-standard motion-reduce:transition-none', updating && 'opacity-60')}>
        <QueryState query={query} skeleton={<SkeletonStats count={3} />} isEmpty={() => false}>
          {(d) => <HeatmapContent data={d} />}
        </QueryState>
      </div>
    </PanelPage>
  );
}
