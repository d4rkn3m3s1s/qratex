'use client';

/**
 * Konular — "neden" satırı (yeniden tasarım vizyonu §4). Kanonik taksonomi (rapor B-13, #37:
 * "Servis/servis/service" tek kova), bahis sayısı + net duygu + önceki döneme göre değişim ve
 * kadran etiketi (öncelikli düzelt / güçlü yan / izle). Anlam renge bırakılmaz (etiket + ikon).
 */
import { AlertTriangle, Eye, ThumbsUp } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { EmptyState, TONE_CHIP } from '@/components/states';
import { DeltaBadge } from '@/components/ds/data';
import { cn } from '@/lib/utils';
import { relDeltaPct } from '@/lib/dealer-analytics/core';
import type { AnalyticsOverview, TopicRow } from '@/lib/dealer-analytics/types';
import { formatNumber, topicLabel, useAnalyticsCopy, useAnalyticsLocale } from './copy';

const QUAD_META = {
  fix: { tone: 'danger', icon: AlertTriangle },
  strength: { tone: 'success', icon: ThumbsUp },
  watch: { tone: 'neutral', icon: Eye },
} as const;

function NetBar({ net }: { net: number }) {
  // −1..1 → merkezden sola (olumsuz) ya da sağa (olumlu).
  const pct = Math.min(1, Math.abs(net)) * 50;
  return (
    <div className="relative h-2 w-full rounded-full bg-surface-muted" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <div
        className={cn('absolute inset-y-0 rounded-full', net >= 0 ? 'left-1/2 bg-success' : 'right-1/2 bg-danger')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TopicsCard({ data }: { data: AnalyticsOverview }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const consumptionOnly = data.filters.effectiveChannel === 'consumption';
  const max = Math.max(1, ...data.topics.map((t) => t.count));

  return (
    <SectionCard
      title={copy.topicsTitle}
      description={consumptionOnly ? copy.topicsConsumption : copy.topicsDescription(formatNumber(data.topicsBase, locale))}
      headingLevel="h2"
    >
      {consumptionOnly || data.topics.length === 0 ? (
        <EmptyState compact headingLevel="p" title={consumptionOnly ? copy.topicsConsumption : copy.topicsEmpty} description={null} />
      ) : (
        <ul className="divide-y divide-border">
          {data.topics.map((t: TopicRow) => {
            const meta = QUAD_META[t.quadrant];
            const Icon = meta.icon;
            const delta = t.compareCount == null ? null : relDeltaPct(t.count, t.compareCount);
            return (
              <li key={t.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,8rem)_auto]">
                <div className="min-w-0">
                  <p className="qx-small truncate font-medium text-fg">{topicLabel(t.key, locale)}</p>
                  <p className="qx-caption qx-num text-fg-subtle">{copy.mentions(formatNumber(t.count, locale))}</p>
                </div>
                <span className={cn('qx-caption inline-flex items-center gap-1 justify-self-end rounded-chip px-2 py-0.5 font-medium sm:order-last', TONE_CHIP[meta.tone])}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {copy.quadrants[t.quadrant]}
                </span>
                <div className="col-span-2 sm:col-span-1" aria-hidden>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(t.count / max) * 100}%` }} />
                  </div>
                </div>
                <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                  <span className="sr-only">
                    {copy.net}: {formatNumber(t.net * 100, locale)}
                  </span>
                  <NetBar net={t.net} />
                  {delta != null && <DeltaBadge delta={{ value: delta, kind: 'percent', goodDirection: 'neutral' }} size="sm" label={null} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
