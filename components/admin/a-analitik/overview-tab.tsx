'use client';

/**
 * Genel bakış: "Platform büyüyor mu? Deneyim iyileşiyor mu? Neye bakmalıyım?" (yeniden tasarım
 * vizyonu). Her KPI kendi serisini çizer (B-7: kullanıcı/tarama kartı geri bildirim eğrisi
 * çizmiyor), kapsamını söyler (dönem / platform geneli / tüm zamanlar) ve aynı `Comparison`
 * nesnesinden delta gösterir (B-2). Duygu dağılımı ham sayı + toplamı 100 olan yüzdeler (B-8).
 */
import Link from 'next/link';
import { Activity, AlertTriangle, MessageSquare, QrCode, Star, ThumbsDown, UserPlus, Users, Zap } from 'lucide-react';
import { ChartFrame, KeyValueList, MetricGrid, MetricTile, lazyChart, type ChartColumn, type MetricValue } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { EmptyState, TONE_CALLOUT } from '@/components/states';
import { cn } from '@/lib/utils';
import { percentagesLargestRemainder } from '@/lib/admin-analytics/core';
import { adminAnalyticsSearchString } from '@/lib/admin-analytics/params';
import type { AdminOverview, Comparison, OverviewSeriesPoint } from '@/lib/admin-analytics/types';
import { ActivityHeatmap } from './activity-heatmap';
import {
  dayLabel,
  fmtNumber,
  fmtRating,
  sectorLabel,
  topicLabel,
  useAdminAnalyticsCopy,
  useAdminAnalyticsLocale,
  type AdminAnalyticsCopy,
} from './copy';

const TrendChart = lazyChart(() => import('./trend-chart'));

type DeltaMode = 'percent' | 'absolute' | 'points';

function toMetric(
  c: Comparison,
  opts: { mode: DeltaMode; label: string | null; format?: MetricValue['format']; good?: 'up' | 'down'; series?: Array<number | null>; n?: number; minN?: number; digits?: number },
): MetricValue {
  const deltaValue = opts.mode === 'percent' ? c.deltaPct : c.deltaAbs;
  return {
    value: c.current,
    format: opts.format ?? 'number',
    fractionDigits: opts.digits,
    delta: opts.label != null && deltaValue != null ? { value: deltaValue, kind: opts.mode, goodDirection: opts.good ?? 'up', label: opts.label } : null,
    series: opts.series ?? null,
    n: opts.n,
    minN: opts.minN,
  };
}

function SentimentCard({ data, copy }: { data: AdminOverview; copy: AdminAnalyticsCopy }) {
  const locale = useAdminAnalyticsLocale();
  const s = data.sentiment;
  const items = [
    { key: 'positive', label: copy.positive, n: s.positive, cls: 'bg-success' },
    { key: 'neutral', label: copy.neutral, n: s.neutral, cls: 'bg-fg-subtle' },
    { key: 'negative', label: copy.negative, n: s.negative, cls: 'bg-danger' },
    { key: 'pending', label: copy.pending, n: s.pending, cls: 'bg-info' },
  ];
  const pct = percentagesLargestRemainder(items.map((i) => i.n));
  return (
    <SectionCard title={copy.sentimentTitle} description={copy.sentimentDescription(fmtNumber(s.total, locale))}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={items.map((i, idx) => `${i.label} ${pct[idx]}%`).join(', ')}>
        {items.map((i, idx) => (pct[idx]! > 0 ? <span key={i.key} className={i.cls} style={{ width: `${pct[idx]}%` }} /> : null))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {items.map((i, idx) => (
          <li key={i.key} className="flex min-w-0 items-center gap-2">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', i.cls)} aria-hidden />
            <span className="qx-small min-w-0 truncate text-fg-muted">{i.label}</span>
            <span className="qx-small ml-auto qx-num text-fg">
              {fmtNumber(i.n, locale)} <span className="text-fg-subtle">· %{pct[idx]}</span>
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function RatingCard({ data, copy }: { data: AdminOverview; copy: AdminAnalyticsCopy }) {
  const locale = useAdminAnalyticsLocale();
  const pct = percentagesLargestRemainder(data.ratings);
  const max = Math.max(1, ...data.ratings);
  return (
    <SectionCard title={copy.ratingTitle} description={`${copy.kpiAvg}: ${fmtRating(data.kpis.avgRating.current, locale)}`}>
      <ul className="space-y-2">
        {[5, 4, 3, 2, 1].map((star) => {
          const n = data.ratings[star - 1] ?? 0;
          return (
            <li key={star} className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-2">
              <span className="qx-small inline-flex items-center gap-1 text-fg-muted">
                {star} <Star className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">{copy.stars(star)}</span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <span className={cn('block h-full rounded-full', star >= 4 ? 'bg-success' : star === 3 ? 'bg-warning' : 'bg-danger')} style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="qx-small text-right qx-num text-fg">
                {fmtNumber(n, locale)} <span className="text-fg-subtle">%{pct[star - 1]}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function AttentionCard({ data, copy, tabHref }: { data: AdminOverview; copy: AdminAnalyticsCopy; tabHref: (tab: string) => string }) {
  const locale = useAdminAnalyticsLocale();
  const { dealers, topics } = data.attention;
  const none = dealers.length === 0 && topics.length === 0;
  return (
    <SectionCard title={copy.attentionTitle} description={copy.attentionDescription} icon={<AlertTriangle className="h-4 w-4" aria-hidden />}>
      {none ? (
        <p className="qx-small text-fg-muted">{copy.attentionNone}</p>
      ) : (
        <div className="space-y-4">
          {dealers.length > 0 && (
            <ul className="space-y-2">
              {dealers.map((d) => (
                <li key={d.id} className={cn('rounded-control border px-3 py-2', TONE_CALLOUT.danger)}>
                  <p className="qx-small font-medium text-fg">{d.name || copy.unnamed}</p>
                  <p className="qx-caption text-fg-muted">
                    {sectorLabel(d.sector, locale)} · {copy.attentionDealer(fmtRating(d.avgRating, locale), fmtRating(d.segmentAvg, locale))} · z {fmtNumber(d.z, locale, 2)} · n {fmtNumber(d.n, locale)}
                  </p>
                </li>
              ))}
              <li>
                <Link href={tabHref('dealers')} className="qx-small inline-flex min-h-11 items-center font-medium text-brand-text underline-offset-4 hover:underline sm:min-h-0">
                  {copy.seeDealers}
                </Link>
              </li>
            </ul>
          )}
          {topics.length > 0 && (
            <ul className="space-y-2">
              {topics.map((t) => (
                <li key={t.key} className={cn('rounded-control border px-3 py-2', TONE_CALLOUT.warning)}>
                  <p className="qx-small font-medium text-fg">{topicLabel(t.key, locale)}</p>
                  <p className="qx-caption text-fg-muted">{copy.attentionTopic(fmtNumber(t.count, locale), fmtNumber(t.previous, locale))}</p>
                </li>
              ))}
              <li>
                <Link href={tabHref('root-cause')} className="qx-small inline-flex min-h-11 items-center font-medium text-brand-text underline-offset-4 hover:underline sm:min-h-0">
                  {copy.seeRootCause}
                </Link>
              </li>
            </ul>
          )}
        </div>
      )}
    </SectionCard>
  );
}

export function OverviewTab({ data }: { data: AdminOverview }) {
  const copy = useAdminAnalyticsCopy();
  const locale = useAdminAnalyticsLocale();
  const q = data.query;
  const label = q.compare === 'none' ? null : q.compare === 'yoy' ? copy.vsYoy : copy.vsPrevious;
  const tabHref = (tab: string) => `/admin/analytics?${adminAnalyticsSearchString(q, { tab })}`;

  if (!data.hasAnyData) {
    return <EmptyState icon={Activity} headingLevel="h2" title={copy.emptyTitle} description={copy.emptyDescription} />;
  }

  const s = data.series;
  const k = data.kpis;
  const negSeries = s.map((p) => (p.reviews > 0 ? (p.negative / p.reviews) * 100 : null));
  const columns: ChartColumn<OverviewSeriesPoint>[] = [
    { key: 'day', label: copy.colDay, format: (v) => dayLabel(String(v), locale, { weekday: 'short', day: 'numeric', month: 'short' }) },
    { key: 'reviews', label: copy.colReviews, numeric: true, format: (v) => fmtNumber(Number(v), locale) },
    { key: 'avgRating', label: copy.colAvg, numeric: true, format: (v) => fmtRating(v as number | null, locale) },
    { key: 'negative', label: copy.colNegative, numeric: true },
    { key: 'newUsers', label: copy.colNewUsers, numeric: true },
    { key: 'scans', label: copy.colScans, numeric: true },
    ...(q.compare !== 'none'
      ? [{ key: 'compareReviews', label: copy.colCompare, numeric: true, format: (v: unknown) => fmtNumber(v as number | null, locale) } as ChartColumn<OverviewSeriesPoint>]
      : []),
  ];
  const totalReviews = k.reviews.current ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <MetricGrid cols={4}>
        <MetricTile
          label={copy.kpiReviews}
          icon={<MessageSquare />}
          tone="brand"
          hint={copy.kpiReviewsHint}
          metric={toMetric(k.reviews, { mode: 'percent', label, series: s.map((p) => p.reviews) })}
          sparklineLabel={copy.kpiReviews}
        />
        <MetricTile
          label={copy.kpiAvg}
          icon={<Star />}
          tone="warning"
          metric={toMetric(k.avgRating, { mode: 'absolute', label, series: s.map((p) => p.avgRating), n: data.ratingN, minN: 30, digits: 2 })}
          sparklineLabel={copy.kpiAvg}
        />
        <MetricTile
          label={copy.kpiNegative}
          icon={<ThumbsDown />}
          tone="danger"
          metric={toMetric(k.negativeShare, { mode: 'points', label, format: 'percent', good: 'down', series: negSeries })}
          sparklineLabel={copy.kpiNegative}
        />
        <MetricTile label={copy.kpiActive} icon={<Users />} tone="info" hint={copy.kpiActiveHint} metric={toMetric(k.activeCustomers, { mode: 'percent', label })} />
        <MetricTile
          label={copy.kpiNewUsers}
          icon={<UserPlus />}
          tone="success"
          hint={copy.platformScope}
          metric={toMetric(k.newUsers, { mode: 'percent', label, series: s.map((p) => p.newUsers) })}
          sparklineLabel={copy.kpiNewUsers}
        />
        <MetricTile
          label={copy.kpiScans}
          icon={<QrCode />}
          tone="brand"
          hint={data.scansPartial ? copy.kpiScansPartial : undefined}
          metric={toMetric(k.scans, { mode: 'percent', label, series: s.map((p) => p.scans) })}
          sparklineLabel={copy.kpiScans}
        />
        <MetricTile
          label={copy.kpiActivation}
          icon={<Zap />}
          tone="success"
          hint={copy.kpiActivationHint}
          metric={toMetric(k.activation, { mode: 'points', label, format: 'percent' })}
        />
        <SectionCard title={copy.userBaseTitle} description={copy.allTime} density="compact">
          <KeyValueList
            layout="inline"
            items={[
              ...(['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN'] as const).map((r) => ({ label: copy.roles[r], value: fmtNumber(data.userBase.byRole[r], locale) })),
              { label: copy.total, value: <strong>{fmtNumber(data.userBase.total, locale)}</strong> },
            ]}
          />
        </SectionCard>
      </MetricGrid>

      {totalReviews === 0 ? (
        <EmptyState compact headingLevel="h2" variant="filtered" title={copy.emptyPeriodTitle} description={copy.emptyPeriodDescription} />
      ) : (
        <>
          <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <ChartFrame<OverviewSeriesPoint>
                title={copy.trendTitle}
                description={copy.trendDescription}
                data={s}
                columns={columns}
                height={280}
                summary={copy.trendSummary(fmtNumber(totalReviews, locale), s.length)}
              >
                <TrendChart data={s} showCompare={q.compare !== 'none'} />
              </ChartFrame>
            </div>
            <AttentionCard data={data} copy={copy} tabHref={tabHref} />
          </div>
          <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
            <SentimentCard data={data} copy={copy} />
            <RatingCard data={data} copy={copy} />
          </div>
          <ActivityHeatmap heatmap={data.heatmap} />
        </>
      )}

      <p className="qx-caption text-fg-subtle">
        {copy.tzNote} {data.query.clean ? copy.cleanNote : null} {copy.activityMoved}{' '}
        <Link href="/admin/platform-pulse" className="font-medium text-brand-text underline-offset-4 hover:underline">
          {copy.activityLink}
        </Link>
      </p>
    </div>
  );
}
