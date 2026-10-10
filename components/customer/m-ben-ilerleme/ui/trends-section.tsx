'use client';

import { useCallback, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarClock, Coins, MapPin, MessageSquare, Sparkles, Store } from 'lucide-react';
import { ChoiceChips, useDsLocale } from '@/components/ds/a11y';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { QueryState, SkeletonBlock } from '@/components/states';
import { formatDate, formatNumber, getMeCopy } from '../copy';
import { fetchEnvelope } from '../fetch-json';
import { periodNarrative } from '../narrative';
import { PROGRESS_PERIODS, type ProgressPeriod } from '../period';
import type { Kpi, KpiKey, PartialKey, ProgressTrends } from '../types';
import { SectionUnavailable } from './section-unavailable';
import { ActivityChart } from './activity-chart';
import { HabitHeatmap } from './habit-heatmap';
import { ExperienceBreakdown, PlacesList } from './insight-cards';

const KPI_ICON: Record<KpiKey, React.ReactNode> = {
  reviews: <MessageSquare />,
  visits: <Store />,
  places: <MapPin />,
  pointsEarned: <Coins />,
  xpEarned: <Sparkles />,
};

export const trendsQueryKey = (period: ProgressPeriod) => ['me-progress', 'trends', period] as const;

/**
 * Kişisel trendler — tek istemci adası. Dönem URL'de (`?period=`) kalır; değişimde yalnız bu
 * bölüm yeniden çekilir (önceki veri ekranda kalır, sayfa spinner'a dönmez — analytics bulgu 5).
 * URL güncellemesi `history.replaceState` ile: sunucu bileşenleri yeniden çalışmaz.
 */
export function TrendsSection({ initial }: { initial: ProgressTrends }) {
  const locale = useDsLocale();
  const c = getMeCopy(locale).progress;
  const [period, setPeriod] = useState<ProgressPeriod>(initial.period);

  const query = useQuery({
    queryKey: trendsQueryKey(period),
    queryFn: ({ signal }) => fetchEnvelope<ProgressTrends>(`/api/customer/me/progress/trends?period=${period}`, signal),
    initialData: period === initial.period ? initial : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const changePeriod = useCallback((next: ProgressPeriod) => {
    setPeriod(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('period', String(next));
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      /* URL güncellenemezse yalnız ekran durumu değişir */
    }
  }, []);

  const data = query.data;
  const range = data
    ? c.trendsDescription(
        formatDate(`${data.fromDay}T12:00:00Z`, locale, { day: 'numeric', month: 'short' }),
        formatDate(`${data.toDay}T12:00:00Z`, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
      )
    : undefined;

  return (
    <section aria-labelledby="me-progress-trends" className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="me-progress-trends" className="qx-h3 text-fg">
            {c.trendsTitle}
          </h2>
          {range && <p className="qx-small mt-0.5 text-fg-muted">{range}</p>}
        </div>
        <ChoiceChips<string>
          aria-label={c.periodLabel}
          value={String(period)}
          onChange={(v) => {
            const p = Number(v);
            if ((PROGRESS_PERIODS as readonly number[]).includes(p)) changePeriod(p as ProgressPeriod);
          }}
          options={PROGRESS_PERIODS.map((p) => ({ value: String(p), label: c.periods[p] }))}
        />
      </div>

      <QueryState
        query={query}
        isEmpty={() => false}
        skeleton={
          <div className="space-y-4">
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-56" />
          </div>
        }
      >
        {(t) => <TrendsBody t={t} />}
      </QueryState>
    </section>
  );
}

function kpiMetric(k: Kpi, series: number[] | null, changeVs: string) {
  return {
    value: k.current,
    format: 'number' as const,
    series,
    delta: k.change.kind === 'pct' ? { value: k.change.value, kind: 'percent' as const, goodDirection: 'up' as const, label: changeVs } : null,
  };
}

function TrendsBody({ t }: { t: ProgressTrends }) {
  const locale = useDsLocale();
  const c = getMeCopy(locale).progress;
  const n = (v: number) => formatNumber(v, locale);
  const seriesFor: Record<KpiKey, number[] | null> = {
    reviews: t.series.reviews,
    visits: t.series.visits,
    places: null,
    pointsEarned: t.series.pointsEarned,
    xpEarned: t.series.xpEarned,
  };
  const fromDayAfterLedger = t.ledgerSince != null && t.ledgerSince > t.fromDay;
  const ledgerNote = t.partial.includes('points')
    ? null
    : t.ledgerSince == null
      ? c.ledgerNone
      : fromDayAfterLedger
        ? c.ledgerPartial(formatDate(`${t.ledgerSince}T12:00:00Z`, locale, { day: 'numeric', month: 'long', year: 'numeric' }))
        : null;
  const failed = (key: PartialKey) => t.partial.includes(key);

  const narrative = failed('activity') ? null : periodNarrative(t.kpis, t.period, locale);

  return (
    <div className="space-y-4">
      {failed('activity') || failed('points') ? <SectionUnavailable locale={locale} /> : null}
      {narrative && (
        <p className="qx-body rounded-card border border-brand-border/50 bg-brand-subtle/60 px-4 py-3 text-fg" aria-live="polite">
          {narrative}
        </p>
      )}
      <MetricGrid cols={5}>
        {t.kpis.map((k) => (
          <MetricTile
            key={k.key}
            size="compact"
            label={c.kpi[k.key]}
            icon={KPI_ICON[k.key]}
            tone="brand"
            metric={kpiMetric(k, seriesFor[k.key], c.changeVs)}
            deltaLabel={c.changeVs}
            hint={k.current == null ? undefined : k.change.kind === 'new' ? c.changeNew : k.change.kind === 'none' ? c.changeNone : undefined}
          />
        ))}
      </MetricGrid>
      {t.pointsSpent != null && t.pointsSpent > 0 && (
        <p className="qx-caption inline-flex items-center gap-1.5 text-fg-muted">
          <CalendarClock aria-hidden className="size-3.5" />
          {c.spent(n(t.pointsSpent))}
        </p>
      )}

      <SectionCard>
        <ActivityChart
          keys={t.keys}
          unit={t.unit}
          series={{
            reviews: failed('activity') ? null : t.series.reviews,
            visits: failed('activity') ? null : t.series.visits,
            pointsEarned: t.series.pointsEarned,
            xpEarned: t.series.xpEarned,
          }}
          locale={locale}
          ledgerNote={ledgerNote}
        />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard headingLevel="h3" title={c.habitsTitle} description={c.habitsDescription}>
          {t.habits ? <HabitHeatmap habits={t.habits} locale={locale} /> : <SectionUnavailable locale={locale} />}
        </SectionCard>
        <SectionCard headingLevel="h3" title={c.experienceTitle} description={c.experienceDescription}>
          {t.experience ? <ExperienceBreakdown experience={t.experience} locale={locale} /> : <SectionUnavailable locale={locale} />}
        </SectionCard>
      </div>

      <SectionCard headingLevel="h3" title={c.placesTitle} description={c.placesDescription}>
        {t.places ? <PlacesList places={t.places} products={t.topProducts} locale={locale} /> : <SectionUnavailable locale={locale} />}
      </SectionCard>
    </div>
  );
}
