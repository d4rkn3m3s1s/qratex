import Link from 'next/link';
import { Check, ChevronDown, Info, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { Sparkline } from '@/components/ds/data';
import { routeHref } from '@/lib/navigation/registry';
import { cn } from '@/lib/utils';
import { CONTRIBUTION_STAGES } from '../contribution';
import { formatNumber, getMeCopy, type MeLocale } from '../copy';
import type { ProgressSummary } from '../types';
import { FOCUS_RING, SOFT_BUTTON } from './styles';

type Contribution = NonNullable<ProgressSummary['contribution']>;

const SIZE = 148;
const STROKE = 12;
const GAP_DEG = 6;

/** Dört aşamalı halka: her çeyrek bir aşama, dolum yalnız o aralıktaki skor kadar. */
function StageGauge({ score, label }: { score: number; label: string }) {
  const r = (SIZE - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const segLen = circ / 4 - (GAP_DEG / 360) * circ;
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label} className="shrink-0">
      <defs>
        <linearGradient id="me-contrib-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--gradient-from))" />
          <stop offset="100%" stopColor="hsl(var(--gradient-to))" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => {
        const frac = Math.min(1, Math.max(0, (score - CONTRIBUTION_STAGES[i]) / 25));
        const rotate = -90 + i * 90 + GAP_DEG / 2;
        const common = {
          cx: SIZE / 2,
          cy: SIZE / 2,
          r,
          fill: 'none',
          strokeWidth: STROKE,
          strokeLinecap: 'butt' as const,
          transform: `rotate(${rotate} ${SIZE / 2} ${SIZE / 2})`,
        };
        return (
          <g key={i}>
            <circle {...common} style={{ stroke: 'hsl(var(--surface-3))' }} strokeDasharray={`${segLen} ${circ}`} />
            {frac > 0 && <circle {...common} style={{ stroke: 'url(#me-contrib-grad)' }} strokeDasharray={`${segLen * frac} ${circ}`} />}
          </g>
        );
      })}
    </svg>
  );
}

export function ContributionCard({
  contribution,
  pendingReviews,
  locale,
}: {
  contribution: Contribution;
  pendingReviews: number | null;
  locale: MeLocale;
}) {
  const c = getMeCopy(locale).progress;
  const n = (v: number, d = 0) => formatNumber(v, locale, { maximumFractionDigits: d });
  const stageName = c.stages[contribution.stage] ?? c.stages[0];
  const wk = contribution.weeklyChange;
  const ctaHref = pendingReviews && pendingReviews > 0 ? routeHref('customer.me.voices') : routeHref('customer.scan');
  const ctaLabel = pendingReviews && pendingReviews > 0 ? c.pendingCta : c.scanCta;
  const plan = contribution.next?.plan ?? null;

  return (
    <SectionCard
      id="katki"
      title={c.contributionTitle}
      description={c.contributionDescription(n(contribution.window.days), n(contribution.window.weeks))}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative grid place-items-center self-center">
          <StageGauge score={contribution.score} label={c.stageAria(n(contribution.score), stageName)} />
          <div aria-hidden className="absolute inset-0 grid place-items-center text-center">
            <div>
              <span className="qx-display block font-display leading-none text-fg">{n(contribution.score)}</span>
              <span className="qx-caption text-fg-muted">/ 100</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="qx-small rounded-chip bg-brand-subtle px-2.5 py-1 font-semibold text-brand-text">{stageName}</span>
            <span
              className={cn(
                'qx-caption inline-flex items-center gap-1 rounded-chip px-2 py-1',
                wk > 0 ? 'bg-success-subtle text-success-text' : wk < 0 ? 'bg-warning-subtle text-warning-text' : 'bg-surface-3 text-fg-muted',
              )}
            >
              {wk > 0 ? <TrendingUp aria-hidden className="size-3.5" /> : wk < 0 ? <TrendingDown aria-hidden className="size-3.5" /> : <Minus aria-hidden className="size-3.5" />}
              {wk === 0 ? c.contributionWeeklyFlat : c.contributionWeekly(formatNumber(wk, locale, { signDisplay: 'always' }))}
            </span>
          </div>

          {contribution.history.length > 1 && (
            <div className="max-w-xs">
              <Sparkline
                data={contribution.history}
                height={36}
                area
                showLast
                zeroBased
                label={`${c.historyLabel}: ${contribution.history.map((v) => n(v)).join(', ')}`}
              />
            </div>
          )}

          {contribution.next ? (
            <div className="space-y-1.5">
              <p className="qx-small font-semibold text-fg">{c.nextStage(c.stages[contribution.next.stage] ?? '')}</p>
              {plan ? (
                <ul className="qx-small space-y-1 text-fg">
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="size-1.5 rounded-full bg-brand" />
                    {c.planReviews(n(plan.reviews))}
                  </li>
                  {plan.detailed > 0 && (
                    <li className="flex items-center gap-2 text-fg-muted">
                      <span aria-hidden className="size-1.5 rounded-full bg-brand/60" />
                      {c.planDetailed(n(plan.detailed))}
                    </li>
                  )}
                  {plan.newWeeks > 0 && (
                    <li className="flex items-center gap-2 text-fg-muted">
                      <span aria-hidden className="size-1.5 rounded-full bg-brand/60" />
                      {c.planWeeks(n(plan.newWeeks))}
                    </li>
                  )}
                </ul>
              ) : (
                <p className="qx-small text-fg-muted">{c.planNone}</p>
              )}
              <Link href={ctaHref} className={cn(SOFT_BUTTON, 'mt-1')}>
                {ctaLabel}
              </Link>
            </div>
          ) : (
            <p className="qx-small text-fg-muted">{c.topStage}</p>
          )}
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label={c.contributionTitle}>
        {c.stages.map((name, i) => {
          const reached = contribution.score >= CONTRIBUTION_STAGES[i];
          const current = contribution.stage === i;
          return (
            <li
              key={name}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'qx-caption flex min-h-11 flex-col justify-center rounded-control border px-2 py-1.5 text-center',
                current ? 'border-brand-border bg-brand-subtle font-semibold text-brand-text' : reached ? 'border-subtle text-fg' : 'border-subtle text-fg-muted',
              )}
            >
              <span className="inline-flex items-center justify-center gap-1">
                {reached && !current && <Check aria-hidden className="size-3" />}
                <span className="truncate">{name}</span>
              </span>
              <span className="qx-num text-fg-muted">{n(CONTRIBUTION_STAGES[i])}+</span>
            </li>
          );
        })}
      </ol>

      <details className="group mt-4 rounded-control border border-subtle">
        <summary
          className={cn(
            'qx-small flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-control px-3 font-medium text-fg [&::-webkit-details-marker]:hidden',
            FOCUS_RING,
          )}
        >
          <span className="inline-flex items-center gap-2">
            <Info aria-hidden className="size-4 text-brand" />
            {c.howTitle}
          </span>
          <ChevronDown aria-hidden className="size-4 transition-transform duration-fast group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="space-y-3 border-t border-subtle px-3 py-3">
          {contribution.components.map((comp) => {
            const meta = c.components[comp.key];
            const pct = comp.max > 0 ? Math.round((comp.points / comp.max) * 100) : 0;
            return (
              <div key={comp.key} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="qx-small font-medium text-fg">{meta.label}</span>
                  <span className="qx-caption qx-num text-fg-muted">{c.componentValue(n(comp.count), n(comp.points, 1), n(comp.max))}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={meta.label}
                  aria-valuemin={0}
                  aria-valuemax={comp.max}
                  aria-valuenow={comp.points}
                  aria-valuetext={c.componentValue(n(comp.count), n(comp.points, 1), n(comp.max))}
                  className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
                >
                  <div className="qx-fx-fill h-full rounded-full bg-brand transition-[width] duration-slow ease-standard" style={{ width: `${pct}%` }} />
                </div>
                <p className="qx-caption text-fg-muted">{meta.help(n(comp.cap))}</p>
              </div>
            );
          })}
          <p className="qx-caption rounded-control bg-surface-3/60 px-2.5 py-2 text-fg">{c.honestNote}</p>
        </div>
      </details>
    </SectionCard>
  );
}
