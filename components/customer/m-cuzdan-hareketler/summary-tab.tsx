'use client';

/**
 * Cüzdan → Hareketler → Özet (eski /customer/spending-overview).
 * Dönem seçici (URL `range`), önceki döneme göre değişim, Europe/Istanbul kovaları,
 * harcama kapsamı + ortalama sepet, birleşik ortalama puan, defterden kazanç bandı,
 * tıklanınca ziyaretleri o mekâna süzen "sık uğradıkların", CSV (sunucuda, kaçışlı).
 */
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronRight, Download, Star, Store, Wallet, ShoppingBasket, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { MetricTile } from '@/components/ds/data';
import { EmptyState, QueryState } from '@/components/states';
import { istanbulDay } from '@/components/ds/page/date-range';
import { cn } from '@/lib/utils';
import { monthStartOf, weekStartOf, SUMMARY_RANGES, type SummaryRange } from '@/lib/customer-wallet/periods';
import type { SpendSummary } from '@/lib/customer-wallet/activity/spend-summary';
import { exportUrl, fetchSummary, shouldRetry, summaryKey } from './api';
import { useMovesCopy, type MovesCopy } from './copy';
import { useFormatters, type Formatters } from './format';
import { PlaceAvatar } from './parts';
import { SummaryChart } from './summary-chart';
import { useSearchParamState } from './use-param';
import { readRange } from './filters';

function pct(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function SummaryTab({
  initial,
  onShowPending,
  onShowDealer,
  onShowLedger,
}: {
  initial?: { range: SummaryRange; data: SpendSummary } | null;
  onShowPending: () => void;
  onShowDealer: (dealerId: string) => void;
  onShowLedger: () => void;
}) {
  const { copy, locale } = useMovesCopy();
  const fmt = useFormatters(locale);
  const url = useSearchParamState();
  const range = readRange(url.get);
  const q = useQuery({
    queryKey: summaryKey(range),
    queryFn: ({ signal }) => fetchSummary(range, signal),
    initialData: initial && initial.range === range ? initial.data : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: shouldRetry,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChoiceChips
          aria-label={copy.rangeLabel}
          size="sm"
          scroll
          options={SUMMARY_RANGES.map((r) => ({ value: r, label: copy.ranges[r] }))}
          value={range}
          onChange={(v) => url.patch({ range: v && v !== 'month' ? v : null })}
        />
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <a href={exportUrl(range, locale)} download aria-label={copy.downloadCsvAria}>
            <Download className="mr-2 h-4 w-4" aria-hidden />
            {copy.downloadCsv}
          </a>
        </Button>
      </div>

      <QueryState query={q} skeleton="stats">
        {(data) => (
          <SummaryBody
            data={data}
            fmt={fmt}
            copy={copy}
            onShowPending={onShowPending}
            onShowDealer={onShowDealer}
            onShowLedger={onShowLedger}
          />
        )}
      </QueryState>
    </div>
  );
}

function SummaryBody({
  data,
  fmt,
  copy,
  onShowPending,
  onShowDealer,
  onShowLedger,
}: {
  data: SpendSummary;
  fmt: Formatters;
  copy: MovesCopy;
  onShowPending: () => void;
  onShowDealer: (dealerId: string) => void;
  onShowLedger: () => void;
}) {
  const { locale } = useMovesCopy();
  const [metric, setMetric] = useState<'visits' | 'spend'>('visits');
  const t = data.totals;
  const today = istanbulDay();
  const currentKey = data.bucket === 'day' ? today : data.bucket === 'week' ? weekStartOf(today) : monthStartOf(today);
  const coverageRatio = t.visits > 0 ? t.spendCount / t.visits : 0;
  const deltaLabel = copy.vsPrevious;
  const visitsDelta = pct(t.visits, data.previous?.visits);
  const spendDelta = t.spendCount > 0 ? pct(t.spend, data.previous?.spend) : null;

  if (t.visits === 0) {
    return (
      <div className="space-y-4">
        <EmptyState title={copy.summaryEmptyTitle} description={copy.summaryEmptyDesc} />
        {data.unreviewed > 0 ? <NextStep count={data.unreviewed} copy={copy} onGo={onShowPending} /> : null}
        <PointsBand data={data} fmt={fmt} copy={copy} onShowLedger={onShowLedger} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <MetricTile
          size="compact"
          label={copy.kpiVisits}
          icon={<MapPin />}
          metric={{ value: t.visits, delta: visitsDelta != null ? { value: visitsDelta, kind: 'percent', label: deltaLabel } : null }}
        />
        <MetricTile size="compact" label={copy.kpiPlaces} icon={<Store />} metric={{ value: t.dealers }} />
        <MetricTile
          size="compact"
          label={copy.kpiSpend}
          icon={<Wallet />}
          metric={{
            value: t.spendCount > 0 ? t.spend : null,
            format: 'currency',
            currency: 'TRY',
            delta: spendDelta != null ? { value: spendDelta, kind: 'percent', goodDirection: 'neutral', label: deltaLabel } : null,
          }}
          hint={copy.coverage(fmt.int(t.spendCount), fmt.int(t.visits))}
        />
        <MetricTile
          size="compact"
          label={copy.kpiBasket}
          icon={<ShoppingBasket />}
          metric={{ value: t.avgBasket, format: 'currency', currency: 'TRY', n: t.spendCount, minN: 3 }}
        />
      </div>
      {t.visits > 0 && coverageRatio < 0.3 ? <p className="qx-caption text-fg-muted">{copy.coverageLow}</p> : null}

      <section aria-labelledby="sum-chart-title" className="rounded-card border border-subtle bg-surface-1 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="sum-chart-title" className="qx-h3 text-fg">
            {copy.chartTitle}
          </h2>
          <ChoiceChips
            aria-label={copy.chartTitle}
            size="sm"
            options={[
              { value: 'visits', label: copy.chartVisits },
              { value: 'spend', label: copy.chartSpend },
            ]}
            value={metric}
            onChange={(v) => setMetric(v === 'spend' ? 'spend' : 'visits')}
          />
        </div>
        <SummaryChart
          key={`${data.range}-${metric}`}
          points={data.series.map((s) => ({ key: s.key, value: metric === 'visits' ? s.visits : s.spend }))}
          bucket={data.bucket}
          fmt={fmt}
          formatValue={(n) => (metric === 'visits' ? fmt.int(n) : fmt.money(n))}
          caption={copy.chartTableCaption}
          valueHeader={metric === 'visits' ? copy.chartVisits : copy.chartSpend}
          bucketHeader={copy.chartBucketCol}
          currentKey={series(data).includes(currentKey) ? currentKey : null}
        />
        {data.firstVisitAt && data.range === 'all' ? (
          <p className="qx-caption mt-2 text-fg-subtle">{copy.sinceFirst(fmt.dayLongYear(data.firstVisitAt))}</p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="sum-places-title" className="rounded-card border border-subtle bg-surface-1 p-3 sm:p-4">
          <h2 id="sum-places-title" className="qx-h3 text-fg">
            {copy.topPlacesTitle}
          </h2>
          <p className="qx-caption mt-0.5 text-fg-muted">{copy.topPlacesHint}</p>
          <ol className="mt-3 space-y-1">
            {data.topDealers.map((d, i) => (
              <li key={d.dealerId}>
                <button
                  type="button"
                  onClick={() => onShowDealer(d.dealerId)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden className="qx-caption qx-num w-5 shrink-0 text-center text-fg-subtle">
                    {i + 1}
                  </span>
                  <PlaceAvatar name={d.name} logo={d.logo} locale={locale} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="qx-small block truncate font-medium text-fg">{d.name ?? copy.unnamedPlace}</span>
                    <span className="qx-caption block truncate text-fg-muted">
                      {copy.placeVisits(fmt.int(d.visits))}
                      {d.spend > 0 ? ` · ${fmt.money(d.spend)}` : ''} · {copy.lastVisit(fmt.relative(d.lastVisitAt))}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        </section>

        <div className="space-y-4">
          {data.rating.count > 0 ? (
            <section aria-labelledby="sum-rating-title" className="rounded-card border border-subtle bg-surface-1 p-3 sm:p-4">
              <h2 id="sum-rating-title" className="qx-small text-fg-muted">
                {copy.kpiRating}
              </h2>
              <p className="mt-1 flex items-baseline gap-2">
                <Star className="h-5 w-5 self-center text-warning" aria-hidden />
                <span className="qx-num text-2xl font-semibold text-fg">{data.rating.avg != null ? fmt.dec(data.rating.avg) : '—'}</span>
                <span className="qx-small text-fg-muted">/ 5</span>
              </p>
              <p className="qx-caption mt-1 text-fg-muted">
                {copy.ratingBreakdown(fmt.int(data.rating.feedbackCount), fmt.int(data.rating.reviewCount))}
              </p>
            </section>
          ) : null}

          {data.topProducts.length > 0 ? (
            <section aria-labelledby="sum-products-title" className="rounded-card border border-subtle bg-surface-1 p-3 sm:p-4">
              <h2 id="sum-products-title" className="qx-h3 text-fg">
                {copy.topProductsTitle}
              </h2>
              <ul className="mt-2 divide-y divide-subtle">
                {data.topProducts.map((p) => (
                  <li key={`${p.name}-${p.icon ?? ''}`} className="flex min-h-11 items-center justify-between gap-3 py-2">
                    <span className="qx-small min-w-0 truncate text-fg">
                      {p.icon ? <span aria-hidden>{p.icon} </span> : null}
                      {p.name}
                    </span>
                    <span className="qx-caption qx-num shrink-0 text-fg-muted">{copy.timesShort(fmt.int(p.count))}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <PointsBand data={data} fmt={fmt} copy={copy} onShowLedger={onShowLedger} />
      {data.unreviewed > 0 ? <NextStep count={data.unreviewed} copy={copy} onGo={onShowPending} /> : null}

      <p className="qx-caption text-fg-subtle">{copy.updatedAt(fmt.time(data.generatedAt))}</p>
    </div>
  );
}

function series(data: SpendSummary): string[] {
  return data.series.map((s) => s.key);
}

function PointsBand({ data, fmt, copy, onShowLedger }: { data: SpendSummary; fmt: Formatters; copy: MovesCopy; onShowLedger: () => void }) {
  const p = data.points;
  if (p.earned === 0 && p.spent === 0) return null;
  const parts = [
    p.earnedFromVisits > 0 ? copy.pointsFromVisits(fmt.int(p.earnedFromVisits)) : null,
    p.earnedFromFeedback > 0 ? copy.pointsFromFeedback(fmt.int(p.earnedFromFeedback)) : null,
  ].filter(Boolean);
  return (
    <section aria-labelledby="sum-points-title" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-subtle bg-surface-1 p-3 sm:p-4">
      <div className="min-w-0">
        <h2 id="sum-points-title" className="qx-small text-fg-muted">
          {copy.pointsBandTitle}
        </h2>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
          <span className="qx-num text-xl font-semibold text-success">{copy.pointsEarned(fmt.int(p.earned))}</span>
          {p.spent > 0 ? <span className="qx-num qx-small text-fg-muted">{copy.pointsSpent(fmt.int(p.spent))}</span> : null}
        </p>
        {parts.length ? <p className="qx-caption mt-0.5 text-fg-muted">{parts.join(' · ')}</p> : null}
      </div>
      <Button variant="outline" className="min-h-11" onClick={onShowLedger}>
        {copy.seeLedger}
      </Button>
    </section>
  );
}

function NextStep({ count, copy, onGo }: { count: number; copy: MovesCopy; onGo: () => void }) {
  return (
    <section
      aria-labelledby="sum-next-title"
      className={cn('flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand-border bg-brand-subtle p-3 sm:p-4')}
    >
      <div className="min-w-0">
        <h2 id="sum-next-title" className="qx-small font-semibold text-brand">
          {copy.nextStepTitle}
        </h2>
        <p className="qx-small mt-0.5 text-fg">{copy.nextStepPending(count)}</p>
      </div>
      <Button className="min-h-11" onClick={onGo}>
        {copy.nextStepGo}
      </Button>
    </section>
  );
}
