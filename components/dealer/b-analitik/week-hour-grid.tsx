'use client';

/**
 * Gün × saat ızgarası — erişilebilir (rapor heatmap Bulgu 14, analitik #27/B-9):
 *  - `<table role="grid">` (gerçek tablo semantiği); her hücre odaklanabilir düğme, gezici tabindex (ok tuşları, Home/End,
 *    PageUp/PageDown), `aria-label` = "Pazartesi 19:00–20:00, 12 geri bildirim".
 *  - Dokunmatikte hücreye dokunmak ayrıntı çekmecesini açar (yalnız `title` yok).
 *  - Masaüstünde satır = gün; mobilde satır = saat (7 sütun dar ekrana sığar, hedef ≥ 44px).
 *    Kaydı olmayan baştaki/sondaki saatler kırpılır (uzun boş satır yok).
 *  - Renk tek başına anlam taşımaz: lejantta sayısal eşikler; puan metriğinde az örneklemli
 *    hücre taralı. Metrik değişince renk 120 ms geçer; azaltılmış harekette anında.
 */
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { cellValue, CELL_MIN_N } from '@/lib/dealer-analytics/core';
import { heatLevel, heatThresholds, LEVEL_ALPHA, ratingTone } from '@/lib/dealer-analytics/heat-scale';
import type { HeatCell, HeatRow, HeatmapMetric, Weekday } from '@/lib/dealer-analytics/types';
import { formatCurrency, formatNumber, formatRating, useAnalyticsCopy, useAnalyticsLocale, weekdayLabel } from './copy';
import { chartDivergingColor, chartSequentialColor } from '@/components/ds/data/chart-theme';

export interface GridSelection {
  day: Weekday;
  hour: number;
}

const HATCH = 'repeating-linear-gradient(135deg, hsl(var(--text-3) / 0.35) 0 2px, transparent 2px 6px)';

export function useCellFormatter(metric: HeatmapMetric) {
  const locale = useAnalyticsLocale();
  const copy = useAnalyticsCopy();
  return useCallback(
    (c: HeatCell): string => {
      const v = cellValue(c, metric);
      switch (metric) {
        case 'rating':
          return v == null ? copy.noData : `${formatRating(v, locale)}★ · ${formatNumber(c.feedback, locale)} ${copy.cellFeedback.toLocaleLowerCase(locale === 'en' ? 'en-US' : 'tr-TR')}`;
        case 'revenue':
          return formatCurrency(v ?? 0, locale);
        case 'visits':
          return `${formatNumber(v ?? 0, locale)} ${copy.cellVisits.toLocaleLowerCase(locale === 'en' ? 'en-US' : 'tr-TR')}`;
        default:
          return `${formatNumber(v ?? 0, locale)} ${copy.cellFeedback.toLocaleLowerCase(locale === 'en' ? 'en-US' : 'tr-TR')}`;
      }
    },
    [metric, locale, copy],
  );
}

function cellStyle(c: HeatCell, metric: HeatmapMetric, max: number, baseline: number | null): React.CSSProperties | undefined {
  if (metric === 'rating') {
    if (c.avgRating == null) return undefined;
    const { tone, alpha } = ratingTone(c.avgRating, baseline);
    // Ayrışan palet (mavi↔gri↔kırmızı): durum yeşil/kırmızısı veri kutbu için kullanılmaz.
    const color = chartDivergingColor(tone === 'danger' ? -alpha : tone === 'success' ? alpha : 0);
    return c.feedback < CELL_MIN_N ? { backgroundColor: color, backgroundImage: HATCH } : { backgroundColor: color };
  }
  const level = heatLevel(cellValue(c, metric), max);
  if (level === 0) return undefined;
  return { backgroundColor: chartSequentialColor(LEVEL_ALPHA[level]) };
}

function visibleHours(rows: readonly HeatRow[]): number[] {
  let lo = 24;
  let hi = -1;
  for (const r of rows) {
    for (const c of r.cells) {
      if (c.feedback > 0 || c.visits > 0 || (c.compareFeedback ?? 0) > 0 || (c.compareVisits ?? 0) > 0) {
        lo = Math.min(lo, c.hour);
        hi = Math.max(hi, c.hour);
      }
    }
  }
  if (hi < 0) return Array.from({ length: 24 }, (_, h) => h);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

type Orientation = 'days-rows' | 'hours-rows';

function GridView({
  rows,
  hours,
  metric,
  max,
  baseline,
  orientation,
  selected,
  onSelect,
  label,
  className,
}: {
  rows: readonly HeatRow[];
  hours: number[];
  metric: HeatmapMetric;
  max: number;
  baseline: number | null;
  orientation: Orientation;
  selected: GridSelection | null;
  onSelect: (s: GridSelection) => void;
  label: string;
  className?: string;
}) {
  const locale = useAnalyticsLocale();
  const copy = useAnalyticsCopy();
  const fmt = useCellFormatter(metric);
  const byDays = orientation === 'days-rows';
  const nRows = byDays ? rows.length : hours.length;
  const nCols = byDays ? hours.length : rows.length;
  const [rawFocus, setFocus] = useState<[number, number]>([0, 0]);
  // Metrik/dönem değişince görünür saat sayısı değişebilir: odak hücresi hep ızgara içinde kalır
  // (aksi hâlde hiçbir hücre tabIndex=0 almaz ve ızgara klavyeyle erişilemez olur).
  const focus: [number, number] = [Math.min(rawFocus[0], Math.max(0, nRows - 1)), Math.min(rawFocus[1], Math.max(0, nCols - 1))];
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const at = (r: number, c: number): { day: HeatRow; cell: HeatCell } => {
    const dayIdx = byDays ? r : c;
    const hour = hours[byDays ? c : r];
    return { day: rows[dayIdx], cell: rows[dayIdx].cells[hour] };
  };

  const move = (r: number, c: number) => {
    const nr = Math.max(0, Math.min(nRows - 1, r));
    const nc = Math.max(0, Math.min(nCols - 1, c));
    setFocus([nr, nc]);
    refs.current.get(`${nr}:${nc}`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(r, c + 1),
      ArrowLeft: () => move(r, c - 1),
      ArrowDown: () => move(r + 1, c),
      ArrowUp: () => move(r - 1, c),
      Home: () => (e.ctrlKey ? move(0, 0) : move(r, 0)),
      End: () => (e.ctrlKey ? move(nRows - 1, nCols - 1) : move(r, nCols - 1)),
      PageUp: () => move(0, c),
      PageDown: () => move(nRows - 1, c),
    };
    const fn = keys[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const colHeaders = byDays
    ? hours.map((h) => ({ key: `h${h}`, label: h % 3 === 0 || hours.length <= 8 ? String(h).padStart(2, '0') : '', full: copy.hourShort(h) }))
    : rows.map((r) => ({ key: r.day, label: weekdayLabel(r.day, locale, 'short'), full: weekdayLabel(r.day, locale) }));
  const rowHeaders = byDays
    ? rows.map((r) => ({ key: r.day, label: weekdayLabel(r.day, locale, 'short'), full: weekdayLabel(r.day, locale) }))
    : hours.map((h) => ({ key: `h${h}`, label: copy.hourShort(h), full: copy.hourRange(h) }));

  return (
    <table
      role="grid"
      aria-label={label}
      className={cn('w-full min-w-0 table-fixed border-separate border-spacing-[3px]', className)}
    >
      <colgroup>
        <col style={{ width: byDays ? '2.75rem' : '3.25rem' }} />
        {colHeaders.map((h) => (
          <col key={h.key} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <td aria-hidden className="h-6 p-0" />
          {colHeaders.map((h) => (
            <th key={h.key} scope="col" className="qx-caption h-6 p-0 align-bottom font-normal text-fg-subtle tabular-nums">
              <span aria-hidden>{h.label}</span>
              <span className="sr-only">{h.full}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rowHeaders.map((rh, r) => (
          <tr key={rh.key}>
            <th scope="row" className="qx-caption p-0 pr-1 text-left align-middle font-normal text-fg-muted tabular-nums">
              <span aria-hidden>{rh.label}</span>
              <span className="sr-only">{rh.full}</span>
            </th>
            {colHeaders.map((_, c) => {
              const { day, cell } = at(r, c);
              const isSel = selected?.day === day.day && selected.hour === cell.hour;
              const isFocus = focus[0] === r && focus[1] === c;
              const value = fmt(cell);
              return (
                <td key={`${day.day}-${cell.hour}`} aria-selected={isSel} className="p-0">
                  <button
                    ref={(el) => {
                      if (el) refs.current.set(`${r}:${c}`, el);
                      else refs.current.delete(`${r}:${c}`);
                    }}
                    type="button"
                    tabIndex={isFocus ? 0 : -1}
                    onFocus={() => setFocus([r, c])}
                    onKeyDown={(e) => onKeyDown(e, r, c)}
                    onClick={() => onSelect({ day: day.day, hour: cell.hour })}
                    aria-label={copy.cellAria(weekdayLabel(day.day, locale), copy.hourRange(cell.hour), value)}
                    className={cn(
                      'block w-full rounded-[4px] bg-surface-muted transition-[background-color,box-shadow] duration-fast ease-standard motion-reduce:transition-none',
                      'hover:ring-2 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                      byDays ? 'h-8' : 'h-11',
                      isSel && 'ring-2 ring-fg',
                    )}
                    style={cellStyle(cell, metric, max, baseline)}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WeekHourGrid({
  rows,
  metric,
  baseline,
  selected,
  onSelect,
  label,
}: {
  rows: readonly HeatRow[];
  metric: HeatmapMetric;
  baseline: number | null;
  selected: GridSelection | null;
  onSelect: (s: GridSelection) => void;
  label: string;
}) {
  const hours = useMemo(() => visibleHours(rows), [rows]);
  const max = useMemo(() => {
    let m = 0;
    for (const r of rows) for (const c of r.cells) m = Math.max(m, cellValue(c, metric) ?? 0);
    return m;
  }, [rows, metric]);
  const common = { rows, hours, metric, max, baseline, selected, onSelect, label };
  return (
    <div className="min-w-0">
      {/* İki yerleşim de DOM'da; görünmeyen `display:none` → odak/ekran okuyucu dışı, CLS yok. */}
      <GridView {...common} orientation="days-rows" className="hidden sm:table" />
      <GridView {...common} orientation="hours-rows" className="sm:hidden" />
      <GridLegend metric={metric} max={max} />
    </div>
  );
}

function GridLegend({ metric, max }: { metric: HeatmapMetric; max: number }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  if (metric === 'rating') {
    return (
      <div className="qx-caption mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: chartDivergingColor(-0.8) }} aria-hidden />
          {copy.gridLegendLow}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: chartDivergingColor(0.8) }} aria-hidden />
          {copy.gridLegendHigh}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-surface-muted" style={{ backgroundImage: HATCH }} aria-hidden />
          {copy.gridLowN(CELL_MIN_N)}
        </span>
      </div>
    );
  }
  const integer = metric !== 'revenue';
  const fmt = (n: number) => (metric === 'revenue' ? formatCurrency(n, locale) : formatNumber(n, locale));
  const steps = heatThresholds(max, integer);
  return (
    <div className="qx-caption mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-fg-muted">
      <span>{copy.gridLegendLess}</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-5 rounded-sm bg-surface-muted" aria-hidden />0
      </span>
      {steps.map((s) => (
        <span key={s.level} className="inline-flex items-center gap-1.5 tabular-nums">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: chartSequentialColor(LEVEL_ALPHA[s.level]) }} aria-hidden />
          {s.from === s.to ? fmt(s.to) : `${fmt(s.from)}–${fmt(s.to)}`}
        </span>
      ))}
      <span>{copy.gridLegendMore}</span>
    </div>
  );
}

