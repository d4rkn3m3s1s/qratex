'use client';

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ChoiceChips } from '@/components/ds/a11y';
import { ChartDataTable } from '@/components/ds/data';
import { cn } from '@/lib/utils';
import { formatNumber, getMeCopy, type MeLocale } from '../copy';
import type { BucketUnit } from '../period';
import { bucketLabel } from './bucket-label';
import { FOCUS_RING } from './styles';

export type SeriesKey = 'reviews' | 'visits' | 'pointsEarned' | 'xpEarned';

type Props = {
  keys: string[];
  unit: BucketUnit;
  series: Partial<Record<SeriesKey, number[] | null>>;
  locale: MeLocale;
  ledgerNote?: string | null;
};

/**
 * Tek gerçek-veri çubuk grafiği. recharts yok (≈100 KB tasarruf); SVG yerine esnek kutular.
 * Erişilebilirlik: grafik `role="slider"` — oklarla/dokunarak kova seçilir, seçili değer
 * `aria-valuetext` ve görünür bilgi şeridiyle okunur; ayrıca tablo karşılığı vardır.
 * Mobilde tooltip yok sorunu (trends bulgu 14): dokunulan kova şeritte gösterilir.
 */
export function ActivityChart({ keys, unit, series, locale, ledgerNote }: Props) {
  const c = getMeCopy(locale).progress;
  const titleId = useId();
  const available = (['reviews', 'visits', 'pointsEarned', 'xpEarned'] as const).filter((k) => Array.isArray(series[k]));
  const [metric, setMetric] = useState<SeriesKey>(available[0] ?? 'reviews');
  const data = useMemo(() => (series[metric] ?? keys.map(() => 0)) as number[], [series, metric, keys]);
  const max = Math.max(1, ...data);
  const total = data.reduce((s, v) => s + v, 0);
  const lastActive = (() => {
    for (let i = data.length - 1; i >= 0; i--) if (data[i] > 0) return i;
    return data.length - 1;
  })();
  const [picked, setPicked] = useState<number | null>(null);
  const index = Math.min(Math.max(0, picked ?? lastActive), Math.max(0, data.length - 1));
  const n = (v: number) => formatNumber(v, locale);
  const metricLabel = c.chartSeries[metric];
  const peakIdx = data.indexOf(Math.max(...data));
  const ariaSummary = c.chartAria(
    metricLabel,
    n(total),
    total > 0 && peakIdx >= 0 ? c.chartPeak(bucketLabel(keys[peakIdx], unit, locale, true), n(data[peakIdx])) : '',
  );
  const selectedText = keys.length
    ? c.chartSelected(bucketLabel(keys[index], unit, locale, true), `${n(data[index] ?? 0)} ${metricLabel.toLocaleLowerCase(locale === 'en' ? 'en-US' : 'tr-TR')}`)
    : '';

  const pickFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || data.length === 0) return;
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * data.length);
    setPicked(Math.min(data.length - 1, Math.max(0, i)));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = data.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, index - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(last, index + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'PageDown') next = Math.max(0, index - 7);
    else if (e.key === 'PageUp') next = Math.min(last, index + 7);
    if (next != null) {
      e.preventDefault();
      setPicked(next);
    }
  };

  const tickIdx = data.length <= 1 ? [0] : [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="qx-body font-semibold text-fg">
          {c.chartTitle}
        </h3>
        {available.length > 1 && (
          <ChoiceChips<SeriesKey>
            aria-label={c.chartTitle}
            size="sm"
            scroll
            value={metric}
            onChange={(v) => {
              if (v) setMetric(v);
            }}
            options={available.map((k) => ({ value: k, label: c.chartSeries[k] }))}
          />
        )}
      </div>

      {total === 0 ? (
        <p className="qx-small rounded-control border border-dashed border-subtle px-3 py-6 text-center text-fg-muted">{c.chartEmpty}</p>
      ) : (
        <>
          <p className="qx-small min-h-5 font-medium text-fg" aria-hidden>
            {selectedText}
          </p>
          <div
            role="slider"
            tabIndex={0}
            aria-labelledby={titleId}
            aria-describedby={`${titleId}-summary`}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, data.length - 1)}
            aria-valuenow={index}
            aria-valuetext={selectedText}
            aria-orientation="horizontal"
            onKeyDown={onKey}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              pickFromPointer(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons > 0 || e.pointerType === 'mouse') pickFromPointer(e);
            }}
            className={cn('relative flex h-40 touch-pan-y select-none items-end gap-[2px] rounded-control', FOCUS_RING)}
          >
            <span aria-hidden className="qx-caption qx-num pointer-events-none absolute left-0 top-0 text-fg-muted">
              {n(max)}
            </span>
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-2.5 border-t border-dashed border-subtle" />
            {data.map((v, i) => (
              <div key={keys[i]} aria-hidden className="flex h-full min-w-0 flex-1 items-end">
                <div
                  className={cn(
                    'w-full rounded-t-[3px] transition-[height,background-color] duration-slow ease-emphasized motion-reduce:transition-none',
                    i === index ? 'bg-brand' : v > 0 ? 'bg-brand/45' : 'bg-surface-3',
                  )}
                  style={{ height: v > 0 ? `${Math.max(4, (v / max) * 88)}%` : '2px' }}
                />
              </div>
            ))}
          </div>
          <div aria-hidden className="qx-caption flex justify-between text-fg-muted">
            {tickIdx.map((i) => (
              <span key={i}>{bucketLabel(keys[i], unit, locale)}</span>
            ))}
          </div>
          <p id={`${titleId}-summary`} className="sr-only">
            {ariaSummary}. {c.chartTapHint}
          </p>
          <p className="qx-caption text-fg-muted" aria-hidden>
            {c.chartTapHint}
          </p>
          <details className="group">
            <summary className={cn('qx-caption inline-flex min-h-11 cursor-pointer items-center rounded-control text-brand-text', FOCUS_RING)}>
              {c.chartTable}
            </summary>
            <div className="mt-2 max-h-64 overflow-auto rounded-control border border-subtle">
              <ChartDataTable
                caption={ariaSummary}
                data={keys.map((k, i) => ({ label: bucketLabel(k, unit, locale, true), value: data[i] ?? 0 }))}
                columns={[
                  { key: 'label', label: c.chartUnit[unit] },
                  { key: 'value', label: metricLabel, numeric: true, format: (v) => n(Number(v) || 0) },
                ]}
              />
            </div>
          </details>
        </>
      )}
      {ledgerNote && (metric === 'pointsEarned' || metric === 'xpEarned') && <p className="qx-caption text-fg-muted">{ledgerNote}</p>}
    </div>
  );
}
