'use client';

/**
 * Analitik › Etki (istemci adası) — eski `/dealer/roi` + `/dealer/business-outcomes` tek ekranda.
 * Anlatı: "Ne kazandırdı?" (kapanan döngü: yanıtlanan şikâyetçilerin geri dönüşü ve tahmini ek
 * ciro), "İşim iyiye mi gidiyor?" (iş sonuçları + besleyen işler, hedefli), "Şimdi ne yapmalı?"
 * (bekleyen işler). Her hesap yöntemi açıkça yazılır; varsayımlar ve hedefler düzenlenebilir.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Download, QrCode, RefreshCw, SlidersHorizontal, Target } from 'lucide-react';
import { ChartFrame, MetricGrid, MetricTile, lazyChart, type ChartColumn } from '@/components/ds/data';
import { FilterBar, PageHeader, PageToolbar, PanelPage, SectionCard, type FilterField } from '@/components/ds/page';
import { EmptyState, InlineError, QueryState, SkeletonStats, TONE_CALLOUT, TONE_CHIP } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  impactQueryKey,
  type GoalKey,
  type GoalProgress,
  type ImpactData,
  type NextStep,
  type TrendPoint,
} from '@/lib/dealer-impact/types';
import type { MetricValue } from '@/components/ds/data/metric-format';
import { useBkCopy } from './copy';
import { AssumptionsSheet } from './assumptions-sheet';
import { downloadCsv, fmtDateTime, fmtDay, fmtDayRange, fmtMoney, fmtNumber, fmtPct, fmtRating, fmtSeconds, fmtUnit, toCsv } from './format';
import { fetchImpact, useFreshRefresh, useImpact, useImpactQueryFromUrl } from './use-bk';
import type { ImpactTrendView } from './impact-trend-chart';

const ImpactTrendChart = lazyChart(() => import('./impact-trend-chart'));

const PRESETS = ['last7', 'last30', 'last90', 'thisMonth', 'lastMonth', 'thisYear'] as const;

// ───────────────────────────── Kapanan döngü ─────────────────────────────

function ArmBar({ label, rate, line, tone }: { label: string; rate: number | null; line: string; tone: 'brand' | 'neutral' }) {
  const reduce = useReducedMotionPref();
  const { copy, locale } = useBkCopy();
  const target = Math.max(0, Math.min(100, rate ?? 0));
  // Çubuk bir kez dolar (≤ 600 ms); azaltılmış harekette anında.
  const [width, setWidth] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) return setWidth(target);
    const id = window.requestAnimationFrame(() => setWidth(target));
    return () => window.cancelAnimationFrame(id);
  }, [target, reduce]);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="qx-small font-medium text-fg">{label}</span>
        <span className="qx-h3 font-semibold tabular-nums text-fg">{rate == null ? '—' : fmtUnit(rate, 'percent', locale)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        <div
          className={cn('h-full rounded-full transition-[width] duration-slow ease-emphasized motion-reduce:transition-none', tone === 'brand' ? 'bg-brand' : 'bg-[hsl(var(--text-3)/0.5)]')}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="qx-caption text-fg-muted">{rate == null ? copy.impact.loop.lowArm : line}</p>
    </div>
  );
}

function ClosedLoopCard({ data, onEditAssumptions }: { data: ImpactData; onEditAssumptions: () => void }) {
  const { copy, locale } = useBkCopy();
  const c = copy.impact.loop;
  const loop = data.closedLoop;
  const basket = data.assumptions.basket;
  const w = loop.windowDays;

  let body: React.ReactNode;
  if (loop.status === 'no_cohort') {
    body = <EmptyState compact headingLevel="p" title={c.noCohortTitle} description={c.noCohortBody(w)} />;
  } else {
    const hero =
      loop.estimatedExtraRevenue != null
        ? { label: c.heroRevenue, value: fmtMoney(loop.estimatedExtraRevenue, locale) }
        : loop.estimatedExtraVisits != null
          ? { label: c.heroVisits, value: fmtNumber(loop.estimatedExtraVisits, locale, 1) }
          : null;
    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="space-y-2">
          {hero ? (
            <>
              <p className="qx-caption flex items-center gap-2 text-fg-muted">
                {hero.label}
                <span className={cn('rounded-chip border px-1.5 py-0.5 font-medium', TONE_CHIP.info)}>{c.estimated}</span>
              </p>
              <p className="qx-display font-semibold tabular-nums text-fg">{hero.value}</p>
            </>
          ) : (
            <p className="qx-body font-medium text-fg">{c.insufficientTitle}</p>
          )}
          {loop.liftPoints != null && (
            <p className={cn('qx-small font-medium', loop.liftPoints >= 0 ? 'text-success' : 'text-danger')}>
              {c.heroLift}: {loop.liftPoints > 0 ? '+' : ''}
              {c.lift(fmtPct(loop.liftPoints, locale))}
            </p>
          )}
          {loop.estimatedExtraVisits != null && loop.estimatedExtraRevenue == null && (
            <p className="qx-caption text-fg-muted">
              {c.noBasket}{' '}
              <button type="button" onClick={onEditAssumptions} className="min-h-11 font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {copy.impact.assumptionsBtn}
              </button>
            </p>
          )}
          {basket.value != null && basket.source !== 'none' && <p className="qx-caption text-fg-muted">{c.basketLine(fmtMoney(basket.value, locale), basket.source)}</p>}
        </div>
        <div className="space-y-4">
          <ArmBar label={c.replied} rate={loop.replied.rate} line={c.armLine(loop.replied.returned, loop.replied.customers)} tone="brand" />
          <ArmBar label={c.unreplied} rate={loop.unreplied.rate} line={c.armLine(loop.unreplied.returned, loop.unreplied.customers)} tone="neutral" />
          {loop.replied.rate != null && loop.unreplied.rate != null && (
            <p className="qx-small text-fg">{c.sentence(fmtPct(loop.replied.rate, locale), fmtPct(loop.unreplied.rate, locale), w)}</p>
          )}
          {loop.liftPoints != null && loop.liftPoints < 0 && <p className={cn('qx-small rounded-control border px-3 py-2', TONE_CALLOUT.warning)}>{c.negativeLift}</p>}
        </div>
      </div>
    );
  }

  return (
    <SectionCard
      title={c.title}
      description={c.desc}
      headingLevel="h2"
      tone="brand"
      stripe
      footer={
        <div className="qx-caption space-y-1 text-fg-muted">
          {loop.cohort && <p>{c.cohort(fmtDayRange(loop.cohort, locale), w)}</p>}
          {loop.pending > 0 && <p>{c.pending(loop.pending, w)}</p>}
          {loop.returnedRevenue > 0 && <p>{c.returnedRevenue(fmtMoney(loop.returnedRevenue, locale))}</p>}
          <p>{c.caveat}</p>
        </div>
      }
    >
      {body}
    </SectionCard>
  );
}

// ───────────────────────────── KPI ─────────────────────────────

const GOAL_FOR: Partial<Record<keyof ImpactData['kpis'], GoalKey>> = {
  returningRate: 'returningRate',
  negativeShare: 'negativeShare',
  recoveryRate: 'recoveryRate',
  replyRate: 'replyRate',
  medianReply: 'medianReplyHours',
};

function GoalLine({ goal }: { goal: GoalProgress | undefined }) {
  const { copy, locale } = useBkCopy();
  const c = copy.impact.kpi;
  if (!goal) return null;
  const unit = copy.impact.goalUnit[goal.key];
  const target = unit === '%' ? fmtUnit(goal.target, 'percent', locale) : `${fmtNumber(goal.target, locale, 2)} ${unit}`;
  const tone = goal.met == null ? 'neutral' : goal.met ? 'success' : 'warning';
  return (
    <p className="qx-caption flex flex-wrap items-center gap-1.5 text-fg-muted">
      <Target className="h-3.5 w-3.5" aria-hidden />
      {c.goal(target)}
      <span className={cn('rounded-chip border px-1.5 font-medium', TONE_CHIP[tone])}>{goal.met == null ? c.goalNoData : goal.met ? c.goalMet : c.goalMissed}</span>
    </p>
  );
}

function KpiSections({ data }: { data: ImpactData }) {
  const { copy, locale } = useBkCopy();
  const c = copy.impact.kpi;
  const k = data.kpis;
  const vs = copy.impact.vsCompare[data.query.compare] || null;
  const goal = (key: keyof ImpactData['kpis']) => {
    const g = GOAL_FOR[key];
    return g ? data.goals.find((x) => x.key === g) : undefined;
  };
  const tile = (key: keyof ImpactData['kpis'], label: string, hint: React.ReactNode, href?: string) => (
    <MetricTile
      key={key}
      label={label}
      metric={k[key] as MetricValue}
      hint={hint}
      deltaLabel={vs}
      href={href}
      register="ops"
      footer={<GoalLine goal={goal(key)} />}
    />
  );
  const cov = data.assumptions.basket.amountCoverage;

  return (
    <div className="space-y-4 sm:space-y-6">
      <section aria-labelledby="etki-sonuclar" className="space-y-3">
        <div>
          <h2 id="etki-sonuclar" className="qx-h3 font-semibold text-fg">{c.outcomesTitle}</h2>
          <p className="qx-caption text-fg-muted">{c.outcomesDesc}</p>
        </div>
        <MetricGrid cols={4}>
          {tile('returningRate', c.returningRate, c.returningHint, '/dealer/customers')}
          {tile('negativeShare', c.negativeShare, c.negativeHint, '/dealer/inbox?sentiment=negative')}
          {tile('recoveryRate', c.recoveryRate, c.recoveryHint, '/dealer/inbox/remedy')}
          {tile('revenue', c.revenue, cov == null || k.revenue.value == null ? c.revenueNoAmount : c.revenueHint(fmtPct(cov, locale)), '/dealer/consumptions')}
        </MetricGrid>
      </section>
      <section aria-labelledby="etki-isler" className="space-y-3">
        <div>
          <h2 id="etki-isler" className="qx-h3 font-semibold text-fg">{c.opsTitle}</h2>
          <p className="qx-caption text-fg-muted">{c.opsDesc}</p>
        </div>
        <MetricGrid cols={4}>
          {tile('replyRate', c.replyRate, null, '/dealer/inbox?status=new')}
          {tile('medianReply', c.medianReply, null)}
          {tile('actionsClosed', c.actionsClosed, c.actionsHint, '/dealer/inbox/assigned')}
          <MetricTile
            label={c.workload}
            metric={{ value: data.workload.open, format: 'number' }}
            hint={data.workload.overdue > 0 ? c.overdue(data.workload.overdue) : c.noOverdue}
            tone={data.workload.overdue > 0 ? 'warning' : undefined}
            href="/dealer/inbox/assigned"
            register="ops"
          />
        </MetricGrid>
      </section>
    </div>
  );
}

// ───────────────────────────── Sonraki adımlar ─────────────────────────────

function NextSteps({ steps, onSetGoals }: { steps: readonly NextStep[]; onSetGoals: () => void }) {
  const { copy } = useBkCopy();
  const c = copy.impact.next;
  return (
    <SectionCard title={c.title} description={c.desc} headingLevel="h2" className="h-full">
      {steps.length === 0 ? (
        <EmptyState compact headingLevel="p" icon={CheckCircle2} tone="success" title={c.allClear} description={c.allClearDesc} />
      ) : (
        <ul className="space-y-2">
          {steps.map((s) => {
            const t = c.kind[s.kind](s.count);
            return (
              <li key={s.kind} className="flex flex-col gap-2 rounded-control border border-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="qx-small font-medium text-fg">{t.title}</span>
                {s.kind === 'set_goals' ? (
                  <Button type="button" variant="outline" size="sm" className="h-11 shrink-0 sm:h-9" onClick={onSetGoals}>
                    {t.cta}
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm" className="h-11 shrink-0 sm:h-9">
                    <Link href={s.href}>
                      {t.cta}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// ───────────────────────────── Eğilim ─────────────────────────────

function TrendSection({ data }: { data: ImpactData }) {
  const { copy, locale } = useBkCopy();
  const c = copy.impact.trend;
  const [view, setView] = useState<ImpactTrendView>('volume');
  const n = (v: unknown) => fmtNumber(Number(v), locale);
  const cols: Record<ImpactTrendView, ChartColumn<TrendPoint>[]> = {
    volume: [
      { key: 'feedback', label: c.feedback, numeric: true, format: n },
      { key: 'replied', label: c.replied, numeric: true, format: n },
      { key: 'negative', label: c.negative, numeric: true, format: n },
    ],
    rating: [{ key: 'avgRating', label: c.avgRating, numeric: true, format: (v) => (v == null ? '—' : fmtRating(Number(v), locale)) }],
    actions: [{ key: 'actionsClosed', label: c.actionsClosed, numeric: true, format: n }],
    visits: [
      { key: 'visits', label: c.visits, numeric: true, format: n },
      { key: 'revenue', label: c.revenue, numeric: true, format: (v) => fmtMoney(Number(v), locale) },
    ],
  };
  const columns: ChartColumn<TrendPoint>[] = [{ key: 'week', label: c.week, format: (v) => fmtDay(String(v), locale, { day: 'numeric', month: 'short', year: 'numeric' }) }, ...cols[view]];
  const views = Object.keys(c.tabs) as ImpactTrendView[];

  return (
    <ChartFrame<TrendPoint>
      title={c.title}
      description={c.desc}
      headingLevel="h2"
      actions={
        <div role="radiogroup" aria-label={c.title} className="inline-flex max-w-full overflow-x-auto rounded-control border border-subtle bg-surface-muted p-0.5">
          {views.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cn(
                'qx-caption inline-flex h-11 shrink-0 items-center rounded-chip px-2.5 font-medium transition-colors duration-fast ease-standard sm:h-8',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === v ? 'bg-surface-1 text-fg qx-elevation-1' : 'text-fg-muted hover:text-fg',
              )}
            >
              {c.tabs[v]}
            </button>
          ))}
        </div>
      }
      data={data.trend}
      columns={columns}
      height={260}
      summary={c.summary(data.trend.length)}
    >
      <ImpactTrendChart data={data.trend} view={view} />
    </ChartFrame>
  );
}

// ───────────────────────────── Şubeler + yöntem ─────────────────────────────

function LocationsCard({ data }: { data: ImpactData }) {
  const { copy, locale } = useBkCopy();
  const c = copy.bench.locations;
  if (data.locations.length < 2) return null;
  const pct = (v: number | null) => (v == null ? '—' : fmtUnit(v, 'percent', locale));
  return (
    <SectionCard title={copy.impact.locations.title} description={copy.impact.locations.desc} headingLevel="h2" density="flush">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left">
          <thead className="qx-caption text-fg-muted">
            <tr className="border-b border-subtle">
              <th scope="col" className="px-4 py-2 font-medium">{c.name}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{c.feedback}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{c.reply}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{c.replyTime}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{c.rating}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{c.negative}</th>
            </tr>
          </thead>
          <tbody className="qx-small tabular-nums">
            {data.locations.map((l) => (
              <tr key={l.id ?? 'none'} className="border-b border-subtle last:border-0">
                <th scope="row" className="px-4 py-2.5 font-medium text-fg">{l.name ?? c.unassigned}</th>
                <td className="px-4 py-2.5 text-right">{fmtNumber(l.feedback, locale)}</td>
                <td className="px-4 py-2.5 text-right">{pct(l.replyRate)}</td>
                <td className="px-4 py-2.5 text-right">{l.medianReplySec == null ? '—' : fmtSeconds(l.medianReplySec, locale)}</td>
                <td className="px-4 py-2.5 text-right">{l.avgRating == null ? '—' : fmtRating(l.avgRating, locale)}</td>
                <td className="px-4 py-2.5 text-right">{pct(l.negativeShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function MethodCard({ data, onEdit }: { data: ImpactData; onEdit: () => void }) {
  const { copy, locale } = useBkCopy();
  const c = copy.impact.method;
  const b = data.assumptions.basket;
  return (
    <SectionCard
      id="varsayimlar"
      title={c.title}
      headingLevel="h2"
      className="scroll-mt-24"
      actions={
        !data.readOnly && (
          <Button type="button" variant="outline" size="sm" className="h-11 gap-2 sm:h-9" onClick={onEdit}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {copy.impact.assumptionsBtn}
          </Button>
        )
      }
    >
      <ul className="qx-small mb-4 flex flex-wrap gap-2">
        <li className="rounded-chip border border-subtle bg-surface-muted px-2.5 py-1">{c.window(data.assumptions.windowDays)}</li>
        <li className="rounded-chip border border-subtle bg-surface-muted px-2.5 py-1">
          {b.value == null ? c.basketNone : b.source === 'custom' ? c.basketCustom(fmtMoney(b.value, locale)) : c.basketObserved(fmtMoney(b.value, locale))}
        </li>
        {b.amountCoverage != null && <li className="rounded-chip border border-subtle bg-surface-muted px-2.5 py-1">{c.coverage(fmtPct(b.amountCoverage, locale))}</li>}
      </ul>
      <details className="group">
        <summary className="qx-small flex min-h-11 cursor-pointer items-center font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {copy.methodTitle}
        </summary>
        <ul className="qx-caption mt-2 list-disc space-y-1.5 pl-5 text-fg-muted">
          {c.items(data.assumptions.windowDays).map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </details>
    </SectionCard>
  );
}

function ImpactContent({ data, onEdit }: { data: ImpactData; onEdit: () => void }) {
  const { copy } = useBkCopy();
  if (!data.hasAnyData) {
    return (
      <EmptyState
        variant="first-use"
        icon={QrCode}
        headingLevel="h2"
        title={copy.impact.emptyTitle}
        description={copy.impact.emptyDesc}
        action={
          <Button asChild className="h-11">
            <Link href="/dealer/qr-codes">{copy.impact.emptyCta}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-4 sm:space-y-6">
      <ClosedLoopCard data={data} onEditAssumptions={onEdit} />
      <KpiSections data={data} />
      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <TrendSection data={data} />
        </div>
        <NextSteps steps={data.readOnly ? data.nextSteps.filter((s) => s.kind !== 'set_goals') : data.nextSteps} onSetGoals={onEdit} />
      </div>
      <LocationsCard data={data} />
      <MethodCard data={data} onEdit={onEdit} />
    </div>
  );
}

// ───────────────────────────── CSV ─────────────────────────────

function impactCsv(data: ImpactData, copy: ReturnType<typeof useBkCopy>['copy']): string {
  const h = copy.impact.csv;
  const k = copy.impact.kpi;
  const rows: unknown[][] = [[h.section, h.metric, h.value, h.compare, h.n]];
  const kpi = (section: string, label: string, m: MetricValue) => rows.push([section, label, m.value, m.delta?.value ?? null, m.n ?? null]);
  kpi(k.outcomesTitle, k.returningRate, data.kpis.returningRate);
  kpi(k.outcomesTitle, k.negativeShare, data.kpis.negativeShare);
  kpi(k.outcomesTitle, k.recoveryRate, data.kpis.recoveryRate);
  kpi(k.outcomesTitle, k.revenue, data.kpis.revenue);
  kpi(k.opsTitle, k.replyRate, data.kpis.replyRate);
  kpi(k.opsTitle, `${k.medianReply} (sn)`, data.kpis.medianReply);
  kpi(k.opsTitle, k.actionsClosed, data.kpis.actionsClosed);
  const l = data.closedLoop;
  const lc = copy.impact.loop;
  rows.push([lc.title, lc.replied, l.replied.rate, null, l.replied.customers]);
  rows.push([lc.title, lc.unreplied, l.unreplied.rate, null, l.unreplied.customers]);
  rows.push([lc.title, lc.heroLift, l.liftPoints, null, null]);
  rows.push([lc.title, lc.heroVisits, l.estimatedExtraVisits, null, null]);
  rows.push([lc.title, lc.heroRevenue, l.estimatedExtraRevenue, null, null]);
  rows.push([]);
  const t = copy.impact.trend;
  rows.push([t.week, t.feedback, t.replied, t.negative, t.avgRating, t.actionsClosed, t.visits, t.revenue]);
  for (const p of data.trend) rows.push([p.week, p.feedback, p.replied, p.negative, p.avgRating, p.actionsClosed, p.visits, p.revenue]);
  return toCsv(rows);
}

// ───────────────────────────── Ekran ─────────────────────────────

export function ImpactScreen() {
  const { copy, locale } = useBkCopy();
  const q = useImpactQueryFromUrl();
  const query = useImpact(q);
  const data = query.data;
  const key = useMemo(() => impactQueryKey(q), [q]);
  const fresh = useFreshRefresh(key, () => fetchImpact(q, { fresh: true }));
  const updating = query.isPlaceholderData || (query.isFetching && !query.isLoading);
  const [sheetOpen, setSheetOpen] = useState(false);
  const fields: FilterField[] = useMemo(
    () => [{ type: 'dateRange', key: 'period', label: copy.impact.periodLabel, defaultPreset: 'last30', defaultCompare: 'previous', presets: PRESETS, maxDays: 366 }],
    [copy],
  );
  const openSheet = () => setSheetOpen(true);

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title={copy.impact.title}
          description={copy.impact.description}
          meta={data ? <span className="qx-caption tabular-nums text-fg-subtle">{copy.updatedAt(fmtDateTime(data.generatedAt, locale))}</span> : null}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {data && !data.readOnly && (
                <Button type="button" variant="outline" size="sm" className="h-11 gap-2 sm:h-9" onClick={openSheet}>
                  <SlidersHorizontal className="h-4 w-4" aria-hidden />
                  {copy.impact.assumptionsBtn}
                </Button>
              )}
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
                onClick={() => data && downloadCsv(impactCsv(data, copy), `etki_${data.query.range.from}_${data.query.range.to}.csv`)}
              >
                <Download className="h-4 w-4" aria-hidden />
                {copy.exportCsv}
              </Button>
            </div>
          }
        />
      }
      toolbar={
        <PageToolbar sticky ariaLabel={copy.impact.periodLabel} summary={updating ? copy.refreshing : fmtDayRange(q.range, locale)}>
          <FilterBar fields={fields} ariaLabel={copy.impact.periodLabel} />
        </PageToolbar>
      }
    >
      {data?.readOnly && (
        <p className={cn('qx-small rounded-control border px-3 py-2', TONE_CALLOUT.info)} role="note">
          {copy.readOnly}
        </p>
      )}
      {fresh.error != null && (
        <InlineError variant="banner" onRetry={fresh.refresh}>
          {fresh.error instanceof Error && fresh.error.message ? fresh.error.message : copy.impact.errorTitle}
        </InlineError>
      )}
      <div aria-busy={updating || undefined} className={cn('transition-opacity duration-base ease-standard motion-reduce:transition-none', updating && 'opacity-60')}>
        <QueryState query={query} skeleton={<SkeletonStats />} isEmpty={() => false} error={{ title: copy.impact.errorTitle, description: copy.impact.errorDesc }}>
          {(d) => <ImpactContent data={d} onEdit={openSheet} />}
        </QueryState>
      </div>
      {data && !data.readOnly && <AssumptionsSheet open={sheetOpen} onOpenChange={setSheetOpen} settings={data.settings} />}
    </PanelPage>
  );
}
