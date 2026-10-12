import { cn } from '@/lib/utils';
import { formatNumber, getMeCopy, type MeLocale } from '../copy';
import type { ProgressTrends } from '../types';
import { weekdayName } from './bucket-label';
import { chartSequentialColor } from '@/components/ds/data/chart-theme';

const BLOCK_HOURS = 3;
const BLOCKS = 24 / BLOCK_HOURS;

function blockLabel(b: number): string {
  const from = String(b * BLOCK_HOURS).padStart(2, '0');
  const to = String((b + 1) * BLOCK_HOURS).padStart(2, '0');
  return `${from}–${to}`;
}

/**
 * Gün × saat alışkanlık haritası (İstanbul saati). 24 saat 3'er saatlik 8 bloğa toplanır:
 * mobilde 7×8 okunur kalır (eski ızgara 14 hücreyi 11 sütuna sıkıştırıp sabah 08–11'i hiç
 * göstermiyordu — analytics bulgu 1/9). Gerçek `<table>`: her hücre ekran okuyucuya sayısıyla
 * okunur; renk tek başına anlam taşımaz (yoğunluk + sayı).
 */
export function HabitHeatmap({ habits, locale }: { habits: NonNullable<ProgressTrends['habits']>; locale: MeLocale }) {
  const c = getMeCopy(locale).progress;
  const grid: number[][] = Array.from({ length: 7 }, () => Array.from({ length: BLOCKS }, () => 0));
  for (const cell of habits.cells) {
    if (cell.d < 1 || cell.d > 7 || cell.h < 0 || cell.h > 23) continue;
    grid[cell.d - 1][Math.floor(cell.h / BLOCK_HOURS)] += cell.n;
  }
  let max = 0;
  let p = { d: -1, b: -1 };
  for (let d = 0; d < grid.length; d++) {
    for (let b = 0; b < BLOCKS; b++) {
      if (grid[d][b] > max) {
        max = grid[d][b];
        p = { d, b };
      }
    }
  }

  if (habits.total === 0 || max === 0) return <p className="qx-small text-fg-muted">{c.habitsEmpty}</p>;

  return (
    <div className="min-w-0 space-y-3">
      <p className="qx-small font-medium text-fg">{c.habitsPeak(weekdayName(p.d + 1, locale, true), blockLabel(p.b))}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[19rem] border-separate border-spacing-1">
          <caption className="sr-only">{c.habitsDescription}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-10" />
              {Array.from({ length: BLOCKS }, (_, b) => (
                <th key={b} scope="col" className="qx-caption qx-num px-0 text-center font-normal text-fg-muted">
                  {String(b * BLOCK_HOURS).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, d) => (
              <tr key={d}>
                <th scope="row" className="qx-caption pr-1 text-left font-normal text-fg-muted">
                  {weekdayName(d + 1, locale)}
                </th>
                {row.map((v, b) => {
                  const alpha = v === 0 ? 0 : 0.18 + 0.82 * (v / max);
                  return (
                    <td key={b} className="p-0">
                      <span
                        className={cn('block h-7 rounded-[6px] border', v === 0 ? 'border-subtle bg-surface-2' : 'border-transparent')}
                        style={v === 0 ? undefined : { backgroundColor: chartSequentialColor(alpha) }}
                      >
                        <span className="sr-only">{c.habitsAria(weekdayName(d + 1, locale, true), blockLabel(b), formatNumber(v, locale))}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div aria-hidden className="qx-caption flex items-center justify-end gap-1.5 text-fg-muted">
        <span>{c.habitsLegendLow}</span>
        {[0.18, 0.45, 0.72, 1].map((a) => (
          <span key={a} className="size-3 rounded-[3px]" style={{ backgroundColor: chartSequentialColor(a) }} />
        ))}
        <span>{c.habitsLegendHigh}</span>
      </div>
    </div>
  );
}
