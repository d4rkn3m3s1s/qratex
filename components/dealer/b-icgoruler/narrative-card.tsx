'use client';

import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Settings2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { InlineError } from '@/components/states';
import { fadeIn, useMotionPolicy } from '@/lib/motion';
import { AI_SETTINGS_HREF } from '@/lib/dealer-insights/params';
import type { InsightsData, InsightsMetrics, NarrativeLine, NarrativeRef } from '@/lib/dealer-insights/types';
import { NARRATIVE_MIN_SAMPLE_CLIENT, type RefHandlers } from './refs';
import { relativeTime, useInsightsCopy } from './copy';
import { InsightsFetchError, useGenerateNarrative } from './use-insights';

function metricLabel(copy: ReturnType<typeof useInsightsCopy>['copy'], key: string): string {
  const map: Record<keyof InsightsMetrics, string> = {
    avgRating: copy.metrics.avgRating,
    csat: copy.metrics.csat,
    negativeRate: copy.metrics.negativeRate,
    responseRate: copy.metrics.responseRate,
    volume: copy.metrics.volume,
    highChurn: copy.metrics.highChurn,
    nps: copy.metrics.nps,
  };
  return map[key as keyof InsightsMetrics] ?? key;
}

/** Bir cümlenin kaynak çipleri — tema/öneri kanıtı açar, uyarı ilgili listeye gider. */
function SourceChips({ refs, handlers, data }: { refs: NarrativeRef[]; handlers: RefHandlers; data: InsightsData }) {
  const { copy } = useInsightsCopy();
  if (refs.length === 0) return null;
  const chip =
    'inline-flex min-h-8 max-w-full items-center gap-1 rounded-chip border border-subtle bg-surface-2 px-2 py-0.5 qx-caption text-fg-muted';
  const interactive =
    'transition-colors duration-fast ease-standard hover:border-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={copy.narrative.sources}>
      {refs.map((r) => {
        const key = `${r.kind}:${r.key}`;
        if (r.kind === 'metric') {
          return (
            <li key={key} className={chip}>
              <span className="text-fg-subtle">{copy.narrative.sourceMetric}:</span>
              <span className="truncate">{metricLabel(copy, r.key)}</span>
            </li>
          );
        }
        if (r.kind === 'alert') {
          const alert = data.alerts.find((a) => a.id === r.key);
          const href = alert ? handlers.alertHref(alert) : null;
          const text = alert ? copy.alerts.kind[alert.kind](alert.params) : copy.narrative.sourceAlert;
          return (
            <li key={key} className="max-w-full">
              {href ? (
                <Link href={href} className={`${chip} ${interactive}`}>
                  <span className="text-fg-subtle">{copy.narrative.sourceAlert}:</span>
                  <span className="truncate">{text}</span>
                </Link>
              ) : (
                <span className={chip}>
                  <span className="text-fg-subtle">{copy.narrative.sourceAlert}:</span>
                  <span className="truncate">{text}</span>
                </span>
              )}
            </li>
          );
        }
        const label = r.kind === 'theme' ? copy.narrative.sourceTheme : copy.narrative.sourceRec;
        return (
          <li key={key} className="max-w-full">
            <button
              type="button"
              className={`${chip} ${interactive}`}
              onClick={() => (r.kind === 'theme' ? handlers.openTheme(r.key, r.label) : handlers.openRec(r.key, r.label))}
            >
              <span className="text-fg-subtle">{label}:</span>
              <span className="truncate">{r.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Line({ line, handlers, data }: { line: NarrativeLine; handlers: RefHandlers; data: InsightsData }) {
  return (
    <>
      <p className="qx-body text-fg">{line.text}</p>
      <SourceChips refs={line.refs} handlers={handlers} data={data} />
    </>
  );
}

/**
 * AI anlatı kartı. Sayıları sistem hesaplar; anlatı yalnız istenince üretilir (GET'te LLM yok),
 * her cümle kaynağına bağlıdır. AI kapalı/yapılandırılmamışsa dürüst neden + Ayarlar → AI.
 */
export function NarrativeCard({ data, handlers, lang }: { data: InsightsData; handlers: RefHandlers; lang: 'tr' | 'en' }) {
  const { copy, tag } = useInsightsCopy();
  const policy = useMotionPolicy();
  const gen = useGenerateNarrative(data.query, lang);
  const n = data.narrative;
  const insufficient = data.sample.total < NARRATIVE_MIN_SAMPLE_CLIENT;
  const canGenerate = data.canWrite && data.ai === 'ok' && !insufficient;
  const cooling = !!n?.cooldownUntil && new Date(n.cooldownUntil).getTime() > Date.now();

  const run = (regenerate: boolean) =>
    gen.mutate(regenerate, {
      onSuccess: () => toast.success(copy.narrative.created),
      onError: (e) => toast.error(e instanceof Error && e.message ? e.message : copy.narrative.failed),
    });

  const errorText =
    gen.error instanceof InsightsFetchError
      ? gen.error.message
      : gen.error
        ? copy.narrative.failed
        : null;

  const action = canGenerate ? (
    <Button
      type="button"
      size="sm"
      variant={n ? 'outline' : 'default'}
      className="min-h-11 sm:min-h-9"
      disabled={gen.isPending || (cooling && !n?.stale)}
      onClick={() => run(!!n)}
      aria-describedby={cooling ? 'insights-narrative-cooldown' : undefined}
    >
      {gen.isPending ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
      ) : n ? (
        <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
      ) : (
        <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
      )}
      {gen.isPending ? copy.narrative.generating : n ? copy.narrative.regenerate : copy.narrative.generate}
    </Button>
  ) : null;

  return (
    <SectionCard
      id="anlati"
      title={copy.narrative.title}
      icon={<Sparkles className="h-4 w-4" aria-hidden />}
      description={copy.narrative.disclaimer}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={copy.narrative.badge} tone="brand" size="sm" icon={null} />
          {action}
        </div>
      }
    >
      <div aria-live="polite" aria-busy={gen.isPending || undefined} className="space-y-4">
        {data.ai !== 'ok' && (
          <InlineError variant="banner" tone="info">
            <span>{copy.narrative.unavailable[data.ai]}</span>{' '}
            {data.ai === 'dealer_off' && data.canWrite && (
              <Link href={AI_SETTINGS_HREF} className="inline-flex items-center gap-1 font-medium text-brand underline-offset-4 hover:underline">
                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                {copy.narrative.openSettings}
              </Link>
            )}
          </InlineError>
        )}
        {insufficient && data.ai === 'ok' && !n && (
          <p className="qx-small text-fg-muted">{copy.narrative.insufficient}</p>
        )}
        {errorText && <InlineError variant="banner">{errorText}</InlineError>}

        {n ? (
          <Motion.div
            key={n.generatedAt}
            variants={policy.variants(fadeIn)}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            <Line line={n.summary} handlers={handlers} data={data} />
            {n.highlights.length > 0 && (
              <div>
                <h3 className="qx-overline mb-2 text-fg-muted">{copy.narrative.highlights}</h3>
                <ul className="space-y-3">
                  {n.highlights.map((h, i) => (
                    <li key={i} className="border-l-2 border-subtle pl-3">
                      <Line line={h} handlers={handlers} data={data} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {n.actions.length > 0 && (
              <div>
                <h3 className="qx-overline mb-2 text-fg-muted">{copy.narrative.actions}</h3>
                <ol className="space-y-3">
                  {n.actions.map((a, i) => (
                    <li key={i} className="flex gap-3">
                      <span
                        aria-hidden
                        className="qx-num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-subtle qx-caption text-brand"
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge
                            label={copy.narrative.priority[a.priority]}
                            tone={a.priority === 'high' ? 'danger' : a.priority === 'medium' ? 'warning' : 'neutral'}
                            size="sm"
                          />
                        </div>
                        <Line line={a} handlers={handlers} data={data} />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-subtle pt-3 qx-caption text-fg-muted">
              <span>{copy.narrative.generatedAt(relativeTime(n.generatedAt, tag))}</span>
              <span aria-hidden>·</span>
              <span>{copy.narrative.basedOn(n.basedOn)}</span>
              {n.stale && <span className="w-full text-warning">{copy.narrative.stale}</span>}
              {cooling && !n.stale && n.cooldownUntil && (
                <span id="insights-narrative-cooldown" className="w-full">
                  {copy.narrative.cooldown(relativeTime(n.cooldownUntil, tag))}
                </span>
              )}
            </div>
          </Motion.div>
        ) : (
          data.ai === 'ok' &&
          !insufficient && (
            <div className="rounded-control border border-dashed border-strong p-4">
              <p className="qx-body font-medium text-fg">{copy.narrative.emptyTitle}</p>
              <p className="mt-1 qx-small text-fg-muted">{copy.narrative.emptyDesc}</p>
            </div>
          )
        )}
      </div>
    </SectionCard>
  );
}
