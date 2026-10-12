'use client';

/**
 * Bayi Analitik → Genel bakış (istemci adası). İlk veri SSR'dan (HydrationBoundary) gelir.
 *
 * Anlatı düzeni (yeniden tasarım vizyonu): üstte durum (KPI), ortada neden (eğilim, duygu, puan,
 * konular), altta aksiyon (öne çıkanlar, QR tablosu → gelen kutusu). Süzgeçler URL'de
 * (`?period=…&compare=…&channel=…&location=…`), paylaşılabilir ve geri tuşuyla uyumlu.
 * Süzgeç değişince eski veri soluk kalır, sayfa spinner'a dönmez (rapor #7, B-6).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { QrCode } from 'lucide-react';
import { ChartFrame, lazyChart, type ChartColumn } from '@/components/ds/data';
import { FilterBar, PageHeader, PageToolbar, PanelPage, formatDayRange, type FilterField } from '@/components/ds/page';
import { EmptyState, InlineError, QueryState, SkeletonStats, TONE_CALLOUT } from '@/components/states';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { csvFileName, qrCsv, seriesCsv, topicsCsv } from '@/lib/dealer-analytics/csv';
import { overviewQueryKey, type AnalyticsOverview, type SeriesPoint } from '@/lib/dealer-analytics/types';
import { dayLabel, formatNumber, formatRating, localeTag, topicLabel, useAnalyticsCopy, useAnalyticsLocale } from './copy';
import { KpiSection } from './kpi-section';
import { RatingCard, SentimentCard } from './distribution-cards';
import { TopicsCard } from './topics-card';
import { HighlightsCard } from './highlights-card';
import { QrTable } from './qr-table';
import { ExportMenu, RefreshButton, UpdatedAt, type ExportItem } from './toolbar-actions';
import { fetchOverview, useAnalyticsOverview, useAnalyticsQueryFromUrl, useFreshRefresh } from './use-analytics';
import type { TrendView } from './trend-chart';

const TrendChart = lazyChart(() => import('./trend-chart'));

const PRESETS = ['last7', 'last30', 'last90', 'thisMonth', 'lastMonth', 'thisYear'] as const;

function useOverviewFields(data: AnalyticsOverview | undefined): FilterField[] {
  const copy = useAnalyticsCopy();
  const locations = data?.filters.locations;
  return useMemo(() => {
    const fields: FilterField[] = [
      { type: 'dateRange', key: 'period', label: copy.period, defaultPreset: 'last30', defaultCompare: 'previous', presets: PRESETS, maxDays: 366 },
      {
        type: 'select',
        key: 'channel',
        label: copy.channel,
        allLabel: copy.channels.all,
        options: [
          { value: 'qr', label: copy.channels.qr },
          { value: 'consumption', label: copy.channels.consumption },
        ],
      },
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
    return fields;
  }, [copy, locations]);
}

function TrendSection({ data }: { data: AnalyticsOverview }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const [view, setView] = useState<TrendView>('volume');
  const showCompare = data.query.compare !== 'none';
  const total = data.series.reduce((s, p) => s + p.count, 0);
  const peak = data.series.reduce<SeriesPoint | null>((best, p) => (p.count > 0 && (!best || p.count > best.count) ? p : best), null);

  const columns: ChartColumn<SeriesPoint>[] =
    view === 'volume'
      ? [
          { key: 'day', label: copy.colDay, format: (v) => dayLabel(String(v), locale, { weekday: 'short', day: 'numeric', month: 'short' }) },
          { key: 'count', label: copy.colCount, numeric: true, format: (v) => formatNumber(Number(v), locale) },
          { key: 'avgRating', label: copy.colAvg, numeric: true, format: (v) => (v == null ? '—' : formatRating(Number(v), locale)) },
          ...(showCompare
            ? [{ key: 'compareCount', label: copy.colCompare, numeric: true, format: (v: unknown) => (v == null ? '—' : formatNumber(Number(v), locale)) } as ChartColumn<SeriesPoint>]
            : []),
        ]
      : [
          { key: 'day', label: copy.colDay, format: (v) => dayLabel(String(v), locale, { weekday: 'short', day: 'numeric', month: 'short' }) },
          { key: 'positive', label: copy.colPositive, numeric: true },
          { key: 'neutral', label: copy.colNeutral, numeric: true },
          { key: 'negative', label: copy.colNegative, numeric: true },
          { key: 'pending', label: copy.colPending, numeric: true },
        ];

  const toggle = (
    <div role="group" aria-label={copy.trendTabsLabel} className="inline-flex rounded-control border border-subtle bg-surface-muted p-0.5">
      {(['volume', 'sentiment'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => setView(v)}
          className={cn(
            'qx-caption inline-flex h-11 items-center rounded-chip px-2.5 font-medium transition-colors duration-fast ease-standard',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            view === v ? 'bg-surface-1 text-fg qx-elevation-1' : 'text-fg-muted hover:text-fg',
          )}
        >
          {copy.trendTabs[v]}
        </button>
      ))}
    </div>
  );

  return (
    <ChartFrame<SeriesPoint>
      title={copy.trendTitle}
      description={copy.trendDescription}
      actions={toggle}
      data={data.series}
      columns={columns}
      height={280}
      summary={copy.trendSummary(formatNumber(total, locale), data.series.length, peak ? dayLabel(peak.day, locale) : null)}
      footer={
        data.anomalies.length > 0 && view === 'volume' ? (
          <span className="qx-caption inline-flex items-center gap-1.5 text-fg-muted">
            <span className="h-2.5 w-2.5 rounded-sm bg-danger" aria-hidden />
            {copy.anomalyLegend}
          </span>
        ) : undefined
      }
    >
      <TrendChart data={data.series} view={view} anomalyDays={data.anomalies.map((a) => a.day)} showCompare={showCompare} />
    </ChartFrame>
  );
}

function OverviewContent({ data, heatmapEnabled }: { data: AnalyticsOverview; heatmapEnabled: boolean }) {
  const copy = useAnalyticsCopy();
  if (!data.hasAnyData) {
    return (
      <EmptyState
        icon={QrCode}
        title={copy.emptyTitle}
        description={copy.emptyDescription}
        headingLevel="h2"
        action={
          <Button asChild>
            <Link href="/dealer/qr-codes">{copy.emptyAction}</Link>
          </Button>
        }
      />
    );
  }
  const emptyPeriod = data.sentiment.total === 0;
  return (
    <div className="space-y-4 sm:space-y-6">
      <KpiSection data={data} />
      {emptyPeriod ? (
        <EmptyState compact headingLevel="h2" title={copy.emptyPeriodTitle} description={copy.emptyPeriodDescription} />
      ) : (
        <>
          <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <TrendSection data={data} />
            </div>
            <HighlightsCard data={data} heatmapEnabled={heatmapEnabled} />
          </div>
          <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
            <TopicsCard data={data} />
            <div className="grid min-w-0 gap-4 sm:gap-6">
              <SentimentCard data={data} />
              <RatingCard data={data} />
            </div>
          </div>
        </>
      )}
      <QrTable data={data} />
      <p className="qx-caption text-fg-subtle">{copy.tzNote}</p>
    </div>
  );
}

export function AnalyticsOverviewScreen({ heatmapEnabled }: { heatmapEnabled: boolean }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const q = useAnalyticsQueryFromUrl();
  const query = useAnalyticsOverview(q);
  const data = query.data;
  const fields = useOverviewFields(data);
  const key = useMemo(() => overviewQueryKey(q), [q]);
  const fresh = useFreshRefresh(key, () => fetchOverview(q, { fresh: true }));
  const updating = query.isPlaceholderData || (query.isFetching && !query.isLoading);

  const exportItems: ExportItem[] = useMemo(() => {
    if (!data) return [];
    const { from, to } = data.query.range;
    return [
      {
        key: 'series',
        label: copy.exportCsvSeries,
        csv: () => ({
          fileName: csvFileName('gunluk', from, to),
          content: seriesCsv(data, [copy.colDay, copy.colCount, copy.colAvg, copy.colPositive, copy.colNeutral, copy.colNegative, copy.colPending, `${copy.colCompare} (${copy.colDay})`, copy.colCompare]),
        }),
      },
      {
        key: 'qr',
        label: copy.exportCsvQr,
        csv: data.qr.length
          ? () => ({
              fileName: csvFileName('qr', from, to),
              content: qrCsv(data, [copy.qrName, 'Kod', copy.qrLocation, copy.qrFeedbacks, copy.qrAvg, `${copy.qrPositive} %`, copy.qrScans, `${copy.qrConversion} %`, copy.colCompare, `${copy.qrDelta} %`]),
            })
          : null,
      },
      {
        key: 'topics',
        label: copy.exportCsvTopics,
        csv: data.topics.length
          ? () => ({
              fileName: csvFileName('konular', from, to),
              content: topicsCsv(data, [copy.topicsTitle, copy.colCount, copy.colPositive, copy.colNegative, copy.net, copy.colCompare], (k) => topicLabel(k, locale)),
            })
          : null,
      },
    ];
  }, [data, copy, locale]);

  const rangeText = formatDayRange(q.range, localeTag(locale));

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title={copy.overviewTitle}
          description={copy.shellDescription}
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
        <PageToolbar sticky ariaLabel={copy.filtersLabel} summary={updating ? copy.updating : rangeText}>
          <FilterBar fields={fields} ariaLabel={copy.filtersLabel} />
        </PageToolbar>
      }
    >
      {q.location && (
        <p className={cn('qx-small rounded-control border px-3 py-2', TONE_CALLOUT.info)} role="note">
          {copy.locationOnlyQr}
        </p>
      )}
      {fresh.error != null && (
        <InlineError variant="banner" onRetry={fresh.refresh}>
          {fresh.error instanceof Error && fresh.error.message ? fresh.error.message : copy.refreshFailed}
        </InlineError>
      )}
      <div aria-busy={updating || undefined} className={cn('transition-opacity duration-base ease-standard motion-reduce:transition-none', updating && 'opacity-60')}>
        <QueryState query={query} skeleton={<SkeletonStats />} isEmpty={() => false}>
          {(d) => <OverviewContent data={d} heatmapEnabled={heatmapEnabled} />}
        </QueryState>
      </div>
    </PanelPage>
  );
}
