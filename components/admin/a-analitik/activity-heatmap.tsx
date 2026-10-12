'use client';

/**
 * Gün × saat ısı haritası (İstanbul saati — rapor B-4). CSS grid: saat etiketleri ilgili
 * sütunlara (00/06/12/18) oturur (B-13 hizasızlık). 168 hücrelik stagger yok; hücreye
 * dokunmak/üzerine gelmek değeri canlı bölgede yazar (dokunmatikte `title` yetmiyordu — B-12),
 * klavye ve ekran okuyucu için "Tabloyu göster" açılımı var. Sahte `cursor-pointer` yok.
 */
import { useState } from 'react';
import { Table2 } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { fmtNumber, useAdminAnalyticsCopy, useAdminAnalyticsLocale, weekdayName } from './copy';
import { chartSequentialColor } from '@/components/ds/data/chart-theme';

const HOUR_LABELS = [0, 6, 12, 18];

export function ActivityHeatmap({ heatmap }: { heatmap: { cells: number[][]; max: number; total: number } }) {
  const copy = useAdminAnalyticsCopy();
  const locale = useAdminAnalyticsLocale();
  const [focus, setFocus] = useState<{ d: number; h: number } | null>(null);
  const [showTable, setShowTable] = useState(false);
  const max = heatmap.max || 1;
  const days = Array.from({ length: 7 }, (_, i) => i);
  const describe = (d: number, h: number) => copy.heatCell(weekdayName(d, locale, 'long'), h, fmtNumber(heatmap.cells[d]?.[h] ?? 0, locale));

  return (
    <SectionCard
      title={copy.heatTitle}
      description={copy.heatDescription}
      actions={
        heatmap.total > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="h-11 gap-1.5 sm:h-8" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
            <Table2 className="h-4 w-4" aria-hidden />
            {showTable ? copy.hideTable : copy.showTable}
          </Button>
        ) : null
      }
    >
      {heatmap.total === 0 ? (
        <EmptyState compact headingLevel="h3" title={copy.heatEmpty} />
      ) : showTable ? (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full border-collapse qx-caption">
            <caption className="sr-only">{copy.heatTitle}</caption>
            <thead>
              <tr>
                <th scope="col" className="px-1 py-1 text-left font-medium text-fg-muted">
                  <span className="sr-only">{copy.colDay}</span>
                </th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} scope="col" className="px-1 py-1 text-right font-medium text-fg-muted qx-num">
                    {String(h).padStart(2, '0')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d} className="border-t border-subtle">
                  <th scope="row" className="px-1 py-1 text-left font-medium text-fg">
                    {weekdayName(d, locale, 'short')}
                  </th>
                  {Array.from({ length: 24 }, (_, h) => (
                    <td key={h} className="px-1 py-1 text-right qx-num text-fg">
                      {heatmap.cells[d]?.[h] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="min-w-0 space-y-3">
          <div
            className="grid min-w-0 gap-[2px]"
            style={{ gridTemplateColumns: 'auto repeat(24, minmax(0, 1fr))' }}
            aria-hidden
            onPointerLeave={() => setFocus(null)}
          >
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={`l${h}`} className="qx-caption whitespace-nowrap text-fg-subtle qx-num" style={{ gridColumn: h + 2 }}>
                {HOUR_LABELS.includes(h) ? String(h).padStart(2, '0') : ''}
              </span>
            ))}
            {days.map((d) => (
              <div key={d} className="contents">
                <span className="qx-caption pr-1.5 text-fg-muted">{weekdayName(d, locale, 'short')}</span>
                {Array.from({ length: 24 }, (_, h) => {
                  const v = heatmap.cells[d]?.[h] ?? 0;
                  const a = v === 0 ? 0 : 0.15 + 0.85 * (v / max);
                  const active = focus?.d === d && focus?.h === h;
                  return (
                    <span
                      key={h}
                      className={active ? 'aspect-square rounded-[3px] ring-2 ring-ring' : 'aspect-square rounded-[3px]'}
                      style={{ background: v === 0 ? 'hsl(var(--border-subtle))' : chartSequentialColor(a) }}
                      onPointerEnter={() => setFocus({ d, h })}
                      onClick={() => setFocus({ d, h })}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="qx-small min-h-5 text-fg-muted" aria-live="polite">
              {focus ? describe(focus.d, focus.h) : ' '}
            </p>
            <div className="qx-caption flex items-center gap-1.5 text-fg-subtle" aria-hidden>
              <span>{copy.heatLess}</span>
              {[0.15, 0.4, 0.65, 1].map((a) => (
                <span key={a} className="h-3 w-3 rounded-[3px]" style={{ background: chartSequentialColor(a) }} />
              ))}
              <span>{copy.heatMore}</span>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
