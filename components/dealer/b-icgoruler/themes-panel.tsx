'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Layers, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { EmptyState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { InsightsData, ThemeRow } from '@/lib/dealer-insights/types';
import type { RefHandlers } from './refs';
import { formatPercent, useInsightsCopy } from './copy';

type SortKey = 'count' | 'avgRating' | 'negativeShare' | 'ratingGap';

function signed(v: number, tag: string, digits = 2): string {
  const s = Math.abs(v).toLocaleString(tag, { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? 1 : 0 });
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  // Formül enjeksiyonu (CSV injection) koruması + tırnaklama.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function downloadCsv(name: string, rows: Array<Array<unknown>>) {
  const body = '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Temalar (eski "tema kümeleri" + "tema performansı" tek görünümde birleşti). Yıldız artık o
 * temadan bahseden kayıtların GERÇEK ortalaması (eskiden model güven skoru × 5 idi); "puan farkı"
 * açıkça ilişki olarak etiketli ve örneklem yetersizse gösterilmez. Satır → kanıt çekmecesi.
 */
export function ThemesPanel({ data, handlers }: { data: InsightsData; handlers: RefHandlers }) {
  const { copy, tag } = useInsightsCopy();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'count', desc: true });
  const hasCompare = !!data.query.compareRange;

  const rows = useMemo(() => {
    const val = (t: ThemeRow): number => {
      const v = t[sort.key];
      return typeof v === 'number' ? v : Number.NEGATIVE_INFINITY;
    };
    return [...data.themes].sort((a, b) => (sort.desc ? val(b) - val(a) : val(a) - val(b)) || b.count - a.count);
  }, [data.themes, sort]);

  const exportCsv = () => {
    const c = copy.themes.col;
    downloadCsv(`${copy.themes.csvName}-${data.query.range.from}_${data.query.range.to}`, [
      [c.theme, c.count, `${c.share} (%)`, c.avg, `${c.negative} (%)`, 'Olumlu / Positive (%)', hasCompare ? c.change : '', c.gap, 'n'],
      ...rows.map((t) => [
        t.label,
        t.count,
        t.share,
        t.avgRating ?? '',
        t.negativeShare,
        t.positiveShare,
        hasCompare && t.prevCount != null ? t.count - t.prevCount : '',
        t.ratingGap ?? '',
        `${t.nWith}/${t.nWithout}`,
      ]),
    ]);
  };

  const SortHeader = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => {
    const active = sort.key === k;
    return (
      <th scope="col" aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'} className={cn('px-3 py-2 text-right font-medium', className)}>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-chip hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : true }))}
        >
          {label}
          {active && (sort.desc ? <ArrowDown className="h-3.5 w-3.5" aria-hidden /> : <ArrowUp className="h-3.5 w-3.5" aria-hidden />)}
        </button>
      </th>
    );
  };

  const change = (t: ThemeRow) => {
    if (!hasCompare || t.prevCount == null) return null;
    if (t.prevCount === 0) return <span className="qx-caption font-medium text-info">{copy.themes.newTheme}</span>;
    const d = t.count - t.prevCount;
    return <span className={cn('qx-num tabular-nums', d > 0 ? 'text-fg' : 'text-fg-muted')}>{signed(d, tag, 0)}</span>;
  };

  const gap = (t: ThemeRow) =>
    t.ratingGap == null ? (
      <span className="qx-caption text-fg-subtle">{copy.themes.gapLow}</span>
    ) : (
      <span
        className={cn('qx-num tabular-nums', t.ratingGap < 0 ? 'text-danger' : t.ratingGap > 0 ? 'text-success' : 'text-fg')}
        aria-label={copy.themes.gapAria(signed(t.ratingGap, tag), t.nWith, t.nWithout)}
      >
        {signed(t.ratingGap, tag)}★
      </span>
    );

  return (
    <div className="space-y-4">
      <SectionCard
        id="temalar"
        title={copy.themes.title}
        description={copy.themes.desc}
        icon={<Layers className="h-4 w-4" aria-hidden />}
        density="flush"
        actions={
          data.themes.length > 0 ? (
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={exportCsv}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              {copy.page.exportCsv}
            </Button>
          ) : null
        }
      >
        {data.themes.length === 0 ? (
          <div className="p-4">
            <EmptyState compact title={copy.themes.none} description={copy.themes.noneDesc} headingLevel="h3" />
          </div>
        ) : (
          <>
            {/* Masaüstü: sıralanabilir tablo */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[44rem] qx-small">
                <caption className="sr-only">{copy.themes.title}</caption>
                <thead className="border-b border-subtle text-fg-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      {copy.themes.col.theme}
                    </th>
                    <SortHeader k="count" label={copy.themes.col.count} />
                    <SortHeader k="avgRating" label={copy.themes.col.avg} />
                    <SortHeader k="negativeShare" label={copy.themes.col.negative} />
                    {hasCompare && (
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {copy.themes.col.change}
                      </th>
                    )}
                    <SortHeader k="ratingGap" label={copy.themes.col.gap} className="pr-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {rows.map((t) => (
                    <tr key={t.key} className="hover:bg-surface-2">
                      <th scope="row" className="px-4 py-2.5 text-left font-normal">
                        <button
                          type="button"
                          className="rounded-chip text-left font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                          onClick={() => handlers.openTheme(t.key, t.label)}
                          aria-label={copy.themes.open(t.label)}
                        >
                          {t.label}
                        </button>
                        {t.subThemes.length > 0 && <p className="mt-0.5 qx-caption text-fg-muted">{t.subThemes.join(' · ')}</p>}
                      </th>
                      <td className="px-3 py-2.5 text-right">
                        <span className="qx-num tabular-nums text-fg">{t.count.toLocaleString(tag)}</span>
                        <span className="ml-1 qx-caption text-fg-muted">{formatPercent(t.share, tag)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right qx-num tabular-nums text-fg">
                        {t.avgRating == null ? '—' : `${t.avgRating.toLocaleString(tag, { maximumFractionDigits: 2 })}★`}
                      </td>
                      <td className="px-3 py-2.5 text-right qx-num tabular-nums text-fg">{formatPercent(t.negativeShare, tag)}</td>
                      {hasCompare && <td className="px-3 py-2.5 text-right">{change(t)}</td>}
                      <td className="px-3 py-2.5 pr-4 text-right">{gap(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobil: kart listesi */}
            <ul className="divide-y divide-subtle md:hidden">
              {rows.map((t) => (
                <li key={t.key}>
                  <button
                    type="button"
                    className="block w-full px-4 py-3 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                    onClick={() => handlers.openTheme(t.key, t.label)}
                    aria-label={copy.themes.open(t.label)}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate qx-body font-medium text-fg">{t.label}</span>
                      <span className="qx-num shrink-0 tabular-nums text-fg">{t.count.toLocaleString(tag)}</span>
                    </div>
                    <dl className="mt-1.5 grid grid-cols-3 gap-2 qx-caption">
                      <div>
                        <dt className="text-fg-muted">{copy.themes.col.avg}</dt>
                        <dd className="qx-num tabular-nums text-fg">
                          {t.avgRating == null ? '—' : `${t.avgRating.toLocaleString(tag, { maximumFractionDigits: 2 })}★`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-fg-muted">{copy.themes.col.negative}</dt>
                        <dd className="qx-num tabular-nums text-fg">{formatPercent(t.negativeShare, tag)}</dd>
                      </div>
                      <div>
                        <dt className="text-fg-muted">{copy.themes.col.gap}</dt>
                        <dd>{gap(t)}</dd>
                      </div>
                    </dl>
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t border-subtle px-4 py-2.5 qx-caption text-fg-muted">{copy.themes.gapHint}</p>
          </>
        )}
      </SectionCard>

      <SectionCard
        id="bahsedilenler"
        title={copy.themes.entities}
        description={copy.themes.entitiesDesc}
        icon={<Tags className="h-4 w-4" aria-hidden />}
      >
        {data.entities.length === 0 ? (
          <p className="qx-small text-fg-muted">{copy.themes.entitiesNone}</p>
        ) : (
          <ul className="grid gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {data.entities.map((e) => (
              <li key={e.key}>
                <button
                  type="button"
                  onClick={() => handlers.openEntity(e.key, e.name)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-control border border-subtle bg-surface-1 px-3 py-2 text-left hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate qx-small font-medium text-fg">{e.name}</span>
                    <span className="block qx-caption text-fg-muted">
                      {copy.themes.entityType[e.type]} · {copy.themes.mentions(e.count)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right qx-caption">
                    <span className="block text-success">
                      {copy.signals.sentimentLabel.positive} {formatPercent(e.positiveShare, tag)}
                    </span>
                    <span className="block text-danger">
                      {copy.signals.sentimentLabel.negative} {formatPercent(e.negativeShare, tag)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
