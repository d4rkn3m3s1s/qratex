'use client';

/**
 * Analitik › Kıyas (istemci adası). İlk veri SSR'dan gelir. Anlatı: "Neredeyim?" (konum + raylar),
 * "Neden?" (eğilim + konu kıyası + şubeler), "Ne yapmalıyım?" (kişisel öneriler). Kıyas tamamen
 * anonim (k ≥ 5 başka işletme); dönem ve akran grubu URL'de (`?period=…&group=…`).
 */
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, Download, Lightbulb, QrCode, RefreshCw, Trophy } from 'lucide-react';
import { ChartFrame, lazyChart, type ChartColumn } from '@/components/ds/data';
import { PageHeader, PageToolbar, PanelPage, SectionCard } from '@/components/ds/page';
import { EmptyState, InlineError, QueryState, SkeletonStats, TONE_CALLOUT } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Reveal } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { benchmarkSearchString } from '@/lib/dealer-benchmark/params';
import {
  BENCHMARK_PRESETS,
  PEER_GROUPS,
  SERIES_METRICS,
  benchmarkQueryKey,
  type BenchmarkData,
  type BenchmarkQuery,
  type Recommendation,
  type SeriesMetricKey,
  type SeriesPoint,
} from '@/lib/dealer-benchmark/types';
import { useBkCopy, type BkCopy } from './copy';
import { downloadCsv, fmtDateTime, fmtDay, fmtDayRange, fmtNumber, fmtPct, fmtRating, fmtSeconds, fmtUnit, toCsv } from './format';
import { MetricRails } from './metric-rails';
import { RankGauge } from './rank-gauge';
import { SegmentCard } from './segment-card';
import { fetchBenchmark, useBenchmark, useBenchmarkQueryFromUrl, useFreshRefresh } from './use-bk';

const BenchTrendChart = lazyChart(() => import('./bench-trend-chart'));

// ───────────────────────────── Araç çubuğu ─────────────────────────────

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string; hint?: string }>; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-control border border-subtle bg-surface-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'qx-caption inline-flex min-h-11 shrink-0 flex-col items-center justify-center rounded-chip px-3 font-medium transition-colors duration-fast ease-standard sm:min-h-9',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? 'bg-surface-1 text-fg qx-elevation-1' : 'text-fg-muted hover:text-fg',
          )}
        >
          <span>{o.label}</span>
          {o.hint && <span className="text-[11px] font-normal leading-tight text-fg-subtle">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────────── Konum ─────────────────────────────

function PositionCard({ data }: { data: BenchmarkData }) {
  const { copy, locale } = useBkCopy();
  const c = copy.bench.position;
  const { rank, self } = data;

  let body: React.ReactNode;
  if (self.status === 'insufficient_data') {
    const left = Math.max(0, self.minFeedback - self.feedback);
    body = (
      <div className="space-y-3">
        <p className="qx-body font-medium text-fg">{c.insufficientTitle}</p>
        <p className="qx-small text-fg-muted">{c.insufficientBody(left, self.minFeedback)}</p>
        <Progress value={(self.feedback / Math.max(1, self.minFeedback)) * 100} aria-label={c.progress(self.feedback, self.minFeedback)} />
        <p className="qx-caption tabular-nums text-fg-muted">{c.progress(self.feedback, self.minFeedback)}</p>
        <Button asChild variant="outline" className="h-11">
          <Link href="/dealer/qr-codes">
            <QrCode className="h-4 w-4" aria-hidden />
            {c.placeQr}
          </Link>
        </Button>
      </div>
    );
  } else if (rank.status !== 'ok' || rank.position == null || rank.outOf == null || rank.topPercent == null || rank.betterThanPercent == null) {
    body = (
      <div className="space-y-2">
        <p className="qx-body font-medium text-fg">{c.tooFewTitle}</p>
        <p className="qx-small text-fg-muted">{c.tooFewBody}</p>
      </div>
    );
  } else {
    const pos = fmtNumber(rank.position, locale);
    const outOf = fmtNumber(rank.outOf, locale);
    const top = fmtNumber(rank.topPercent, locale);
    const moved = rank.prevPosition != null ? rank.prevPosition - rank.position : null;
    body = (
      <div className="space-y-3 text-center">
        <RankGauge betterThan={rank.betterThanPercent} center={c.top(top)} label={c.gaugeLabel(top, pos, outOf)} />
        <p className="qx-body text-fg">{c.rankLine(pos, outOf)}</p>
        <p className="qx-small text-fg-muted">{c.betterThan(fmtPct(rank.betterThanPercent, locale))}</p>
        <p className={cn('qx-caption', moved == null ? 'text-fg-subtle' : moved > 0 ? 'text-success' : moved < 0 ? 'text-danger' : 'text-fg-muted')}>
          {moved == null ? c.noPrev : c.moved(moved)}
        </p>
      </div>
    );
  }

  return (
    <SectionCard title={c.title} description={`${c.desc} · ${copy.bench.groups[data.group]}`} icon={<Trophy className="h-4 w-4" aria-hidden />} headingLevel="h2" className="h-full">
      {body}
    </SectionCard>
  );
}

// ───────────────────────────── Öneriler ─────────────────────────────

function recText(r: Recommendation, data: BenchmarkData, copy: BkCopy, locale: 'tr' | 'en') {
  const it = copy.bench.recs.item;
  const pct = (v: number | null) => (v == null ? '—' : fmtPct(v, locale));
  switch (r.kind) {
    case 'rating':
      return it.rating(r.you == null ? '—' : fmtRating(r.you, locale), r.target == null ? '—' : fmtRating(r.target, locale));
    case 'replyTime':
      return it.replyTime(r.you == null ? '—' : fmtSeconds(r.you, locale), r.target == null ? '—' : fmtSeconds(r.target, locale));
    case 'negativeShare':
    case 'replyRate':
    case 'actionClose':
      return it[r.kind](pct(r.you), pct(r.target));
    case 'topic':
      return it.topic(r.topic ?? '', pct(r.you), pct(r.target));
    case 'more_feedback':
      return it.more_feedback();
    case 'set_category':
      return it.set_category();
  }
  void data;
}

function Recommendations({ data }: { data: BenchmarkData }) {
  const { copy, locale } = useBkCopy();
  const c = copy.bench.recs;
  return (
    <SectionCard title={c.title} description={c.desc} icon={<Lightbulb className="h-4 w-4" aria-hidden />} headingLevel="h2" className="h-full">
      {data.recommendations.length === 0 ? (
        <EmptyState compact headingLevel="p" tone="success" title={c.none} description={c.noneDesc} />
      ) : (
        <ol className="space-y-3">
          {data.recommendations.map((r, i) => {
            const t = recText(r, data, copy, locale);
            return (
              <Reveal key={`${r.kind}-${r.topic ?? ''}`} index={i} as="li">
                <div className="flex flex-col gap-3 rounded-control border border-subtle bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="qx-small font-medium text-fg">{t.title}</p>
                    <p className="qx-caption mt-0.5 text-fg-muted">{t.body}</p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="h-11 shrink-0 sm:h-9">
                    <Link href={r.href}>
                      {t.cta}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                </div>
              </Reveal>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}

// ───────────────────────────── Eğilim ─────────────────────────────

function TrendSection({ data }: { data: BenchmarkData }) {
  const { copy, locale } = useBkCopy();
  const c = copy.bench.trend;
  const [metric, setMetric] = useState<SeriesMetricKey>('rating');
  const points = data.series[metric];
  const unit = metric === 'rating' ? 'rating' : 'percent';
  const fmt = (v: unknown) => (v == null ? '—' : fmtUnit(Number(v), unit, locale));
  const columns: ChartColumn<SeriesPoint>[] = [
    { key: 'start', label: c.colStart, format: (v) => fmtDay(String(v), locale, { day: 'numeric', month: 'short', year: 'numeric' }) },
    { key: 'you', label: c.colYou, numeric: true, format: fmt },
    { key: 'n', label: c.colN, numeric: true },
    { key: 'peerP50', label: c.colP50, numeric: true, format: fmt },
    { key: 'peerP25', label: `${c.colBand} (p25)`, numeric: true, format: fmt },
    { key: 'peerP75', label: `${c.colBand} (p75)`, numeric: true, format: fmt },
  ];
  const last = [...points].reverse().find((p) => p.you != null);
  const hasAny = points.some((p) => p.you != null || p.peerP50 != null);

  return (
    <ChartFrame<SeriesPoint>
      title={c.title}
      description={c.desc(data.period.bucket)}
      actions={
        <Segmented
          label={c.title}
          value={metric}
          onChange={setMetric}
          options={SERIES_METRICS.map((k) => ({ value: k, label: c.tabs[k] }))}
        />
      }
      data={points}
      columns={columns}
      height={260}
      headingLevel="h2"
      summary={last ? c.summary(c.tabs[metric], fmt(last.you), fmt(last.peerP50)) : c.empty}
      empty={hasAny ? undefined : { title: c.empty, compact: true }}
      footer={<span className="qx-caption text-fg-muted">{c.lowN}</span>}
    >
      {hasAny ? <BenchTrendChart data={points} metric={metric} bucket={data.period.bucket} /> : <EmptyState compact headingLevel="p" title={c.empty} />}
    </ChartFrame>
  );
}

// ───────────────────────────── Konular + şubeler ─────────────────────────────

function TopicsCard({ data }: { data: BenchmarkData }) {
  const { copy, locale } = useBkCopy();
  const c = copy.bench.topics;
  if (data.topics.length === 0) return null;
  return (
    <SectionCard title={c.title} description={c.desc} headingLevel="h2">
      <ul className="space-y-4">
        {data.topics.map((t) => (
          <li key={t.topic} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="qx-small font-medium capitalize text-fg">{t.topic}</span>
              <span className="qx-caption text-fg-muted">{c.mentions(t.youMentions)}</span>
            </div>
            <div className="relative h-2 rounded-full bg-surface-muted" aria-hidden>
              <div className="absolute inset-y-0 left-0 rounded-full bg-danger/70" style={{ width: `${Math.min(100, t.youShare)}%` }} />
              <div className="absolute -inset-y-1 w-0.5 rounded bg-fg-muted" style={{ left: `${Math.min(100, t.peerShare)}%` }} />
            </div>
            <p className="qx-caption text-fg-muted">{c.row(fmtPct(t.youShare, locale), fmtPct(t.peerShare, locale))}</p>
          </li>
        ))}
      </ul>
      <Button asChild variant="link" className="mt-3 h-11 px-0">
        <Link href="/dealer/inbox?sentiment=negative">
          {c.open}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </Button>
    </SectionCard>
  );
}

function LocationsCard({ data }: { data: BenchmarkData }) {
  const { copy, locale } = useBkCopy();
  const c = copy.bench.locations;
  if (data.locations.length === 0) return null;
  const pct = (v: number | null) => (v == null ? '—' : fmtUnit(v, 'percent', locale));
  return (
    <SectionCard title={c.title} description={c.desc} headingLevel="h2" density="flush">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left">
          <thead className="qx-caption text-fg-muted">
            <tr className="border-b border-subtle">
              <th scope="col" className="px-4 py-2 font-medium">{c.name}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{c.feedback}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{c.rating}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{c.reply}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{c.negative}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{c.replyTime}</th>
            </tr>
          </thead>
          <tbody className="qx-small tabular-nums">
            {data.locations.map((l) => (
              <tr key={l.id ?? 'none'} className="border-b border-subtle last:border-0">
                <th scope="row" className="px-4 py-2.5 font-medium text-fg">{l.name ?? c.unassigned}</th>
                <td className="px-4 py-2.5 text-right">{fmtNumber(l.feedback, locale)}</td>
                <td className="px-4 py-2.5 text-right">{l.avgRating == null ? '—' : fmtRating(l.avgRating, locale)}</td>
                <td className="px-4 py-2.5 text-right">{pct(l.replyRate)}</td>
                <td className="px-4 py-2.5 text-right">{pct(l.negativeShare)}</td>
                <td className="px-4 py-2.5 text-right">{l.medianReplySec == null ? '—' : fmtSeconds(l.medianReplySec, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function MethodNote() {
  const { copy } = useBkCopy();
  return (
    <details className="group rounded-card border border-subtle bg-surface-1 p-4">
      <summary className="qx-small flex min-h-11 cursor-pointer items-center font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {copy.methodTitle}
      </summary>
      <ul className="qx-caption mt-2 list-disc space-y-1.5 pl-5 text-fg-muted">
        {copy.bench.method.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </details>
  );
}

function BenchmarkContent({ data }: { data: BenchmarkData }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <PositionCard data={data} />
        <Recommendations data={data} />
      </div>
      <MetricsCard data={data} />
      <TrendSection data={data} />
      {(data.topics.length > 0 || data.locations.length > 0) && (
        <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
          <TopicsCard data={data} />
          <LocationsCard data={data} />
        </div>
      )}
      <SegmentCard data={data} />
      <MethodNote />
    </div>
  );
}

function MetricsCard({ data }: { data: BenchmarkData }) {
  const { copy } = useBkCopy();
  return (
    <SectionCard title={copy.bench.rails.title} description={copy.bench.rails.desc} headingLevel="h2">
      <MetricRails metrics={data.metrics} />
    </SectionCard>
  );
}

// ───────────────────────────── CSV ─────────────────────────────

function benchmarkCsv(data: BenchmarkData, copy: BkCopy): string {
  const h = copy.bench.csv;
  const rows: unknown[][] = [[h.metric, h.you, h.n, h.p25, h.p50, h.p75, h.top, h.betterThan]];
  for (const r of data.metrics) {
    rows.push([copy.bench.rails.label[r.key], r.you, r.youN, r.peer?.p25, r.peer?.p50, r.peer?.p75, r.peer?.top, r.betterThanPercent]);
  }
  return toCsv(rows);
}

// ───────────────────────────── Ekran ─────────────────────────────

export function BenchmarkScreen() {
  const { copy, locale } = useBkCopy();
  const q = useBenchmarkQueryFromUrl();
  const query = useBenchmark(q);
  const data = query.data;
  const router = useRouter();
  const pathname = usePathname();
  const [navPending, startNav] = useTransition();
  const key = useMemo(() => benchmarkQueryKey(q), [q]);
  const fresh = useFreshRefresh(key, () => fetchBenchmark(q, { fresh: true }));
  const updating = navPending || query.isPlaceholderData || (query.isFetching && !query.isLoading);

  const go = (next: BenchmarkQuery) => {
    const qs = benchmarkSearchString(next);
    startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const groupOptions = PEER_GROUPS.map((g) => {
    const s = data?.segments.find((x) => x.group === g);
    const hint = !s ? undefined : s.reason === 'ok' ? copy.bench.groupReason.ok(s.contributors) : s.reason === 'too_few' ? copy.bench.groupReason.too_few(s.contributors) : copy.bench.groupReason.not_set[g];
    return { value: g, label: copy.bench.groups[g], hint: hint || undefined };
  });
  const activeGroup = q.group ?? data?.group ?? 'platform';

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title={copy.bench.title}
          description={copy.bench.description}
          meta={data ? <span className="qx-caption tabular-nums text-fg-subtle">{copy.updatedAt(fmtDateTime(data.generatedAt, locale))}</span> : null}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-11 gap-2 sm:h-9" onClick={fresh.refresh} disabled={fresh.pending || !data} aria-busy={fresh.pending || undefined}>
                <RefreshCw className={cn('h-4 w-4', fresh.pending && 'motion-safe:animate-spin')} aria-hidden />
                {fresh.pending ? copy.refreshing : copy.refresh}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 gap-2 sm:h-9"
                disabled={!data}
                onClick={() => data && downloadCsv(benchmarkCsv(data, copy), `kiyas_${data.group}_${data.period.range.from}_${data.period.range.to}.csv`)}
              >
                <Download className="h-4 w-4" aria-hidden />
                {copy.exportCsv}
              </Button>
            </div>
          }
        />
      }
      toolbar={
        <PageToolbar sticky ariaLabel={copy.bench.periodLabel} summary={updating ? copy.refreshing : data ? fmtDayRange(data.period.range, locale) : undefined}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Segmented
              label={copy.bench.periodLabel}
              value={q.preset}
              onChange={(preset) => go({ ...q, preset })}
              options={BENCHMARK_PRESETS.map((p) => ({ value: p, label: copy.bench.periods[p] }))}
            />
            <Segmented label={copy.bench.groupLabel} value={activeGroup} onChange={(group) => go({ ...q, group })} options={groupOptions} />
          </div>
        </PageToolbar>
      }
    >
      {fresh.error != null && (
        <InlineError variant="banner" onRetry={fresh.refresh}>
          {fresh.error instanceof Error && fresh.error.message ? fresh.error.message : copy.bench.errorTitle}
        </InlineError>
      )}
      {data && data.self.status === 'ready' && data.rank.status === 'too_few_peers' && (
        <p className={cn('qx-small rounded-control border px-3 py-2', TONE_CALLOUT.info)} role="note">
          {copy.bench.position.tooFewBody}
        </p>
      )}
      <div aria-busy={updating || undefined} className={cn('transition-opacity duration-base ease-standard motion-reduce:transition-none', updating && 'opacity-60')}>
        <QueryState query={query} skeleton={<SkeletonStats />} isEmpty={() => false} error={{ title: copy.bench.errorTitle, description: copy.bench.errorDesc }}>
          {(d) => <BenchmarkContent data={d} />}
        </QueryState>
      </div>
    </PanelPage>
  );
}
