'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Download, ListChecks, Plus, MessageSquareText, Receipt, Reply, Sparkles, Star, ThumbsDown, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { QueryState } from '@/components/states';
import { SectionCard } from '@/components/ds/page';
import { MetricGrid, MetricTile, StatusBadge } from '@/components/ds/data';
import type { WeeklyArchiveRow, WeeklyReport as WeeklyData, WeeklyTheme } from '@/lib/dealer-today/types';
import { useTodayCopy } from './copy';
import { TodayFetchError, useAddSuggestion, useGenerateNarrative, useWeeklyArchive, useWeeklyReport } from './use-today';

function useDayFormat() {
  const { tag } = useTodayCopy();
  return useMemo(() => {
    const short = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const withYear = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    const at = (day: string) => new Date(`${day}T12:00:00Z`);
    return { short: (d: string) => short.format(at(d)), long: (d: string) => withYear.format(at(d)) };
  }, [tag]);
}

/**
 * Haftalık rapor sekmesi (eski `/dealer/weekly-brief` + operations-brief AI paneli).
 * Hafta `?week=` ile paylaşılabilir; arşivden bir haftaya tıklamak raporu o haftaya çevirir.
 */
export default function WeeklyReportPanel({ week, onWeekChange }: { week: string | null; onWeekChange: (week: string | null) => void }) {
  const { copy } = useTodayCopy();
  const query = useWeeklyReport(week);
  return (
    <div className="space-y-4">
      <QueryState query={query} skeleton="cards" error={{ title: copy.weekly.errorTitle }} isEmpty={() => false} showRefreshing>
        {(data) => <WeeklyBody data={data} onWeekChange={onWeekChange} />}
      </QueryState>
      <WeeklyArchive current={query.data?.week ?? null} onOpen={onWeekChange} />
    </div>
  );
}

function WeeklyBody({ data, onWeekChange }: { data: WeeklyData; onWeekChange: (w: string | null) => void }) {
  const { copy } = useTodayCopy();
  const fmt = useDayFormat();
  const m = data.metrics;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="min-h-11 shadow-none sm:min-h-9" disabled={!data.prevWeek} onClick={() => data.prevWeek && onWeekChange(data.prevWeek)}>
          <ChevronLeft aria-hidden className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">{copy.weekly.prev}</span>
        </Button>
        <h2 className="min-w-0 flex-1 text-center text-base font-semibold text-fg sm:flex-none sm:text-left" aria-live="polite">
          {copy.weekly.range(fmt.short(data.week), fmt.long(data.weekEnd))}
          {!data.isComplete && <span className="ml-2 align-middle"><StatusBadge label={copy.weekly.inProgress} tone="info" size="sm" /></span>}
        </h2>
        <Button variant="outline" size="sm" className="min-h-11 shadow-none sm:min-h-9" disabled={!data.nextWeek} onClick={() => data.nextWeek && onWeekChange(data.nextWeek)}>
          <span className="sr-only sm:not-sr-only">{copy.weekly.next}</span>
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Button>
      </div>

      <MetricGrid cols={5}>
        <MetricTile label={copy.weekly.feedback} metric={m.feedback} icon={<MessageSquareText />} tone="brand" deltaLabel={copy.weekly.vsPrevWeek} hint={copy.weekly.sources(data.sources.qr, data.sources.consumption)} />
        <MetricTile label={copy.weekly.avgRating} metric={m.avgRating} icon={<Star />} tone="warning" deltaLabel={copy.weekly.vsPrevWeek} />
        <MetricTile label={copy.weekly.negativeRate} metric={m.negativeRate} icon={<ThumbsDown />} tone="danger" deltaLabel={copy.weekly.vsPrevWeek} />
        <MetricTile label={copy.weekly.responseRate} metric={m.responseRate} icon={<Reply />} tone="success" deltaLabel={copy.weekly.vsPrevWeek} />
        <MetricTile label={copy.weekly.consumptions} metric={m.consumptions} icon={<Receipt />} tone="info" deltaLabel={copy.weekly.vsPrevWeek} className="min-[360px]:max-xl:col-span-2" />
      </MetricGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Themes themes={data.themes} />
        <div className="space-y-4">
          <SectionCard title={copy.weekly.autoTitle} icon={<ListChecks />} density="compact" actions={<StatusBadge label={copy.weekly.autoBadge} tone="neutral" size="sm" icon={null} />}>
            <p className={cn('text-sm', data.autoRecommendation ? 'text-fg' : 'text-fg-muted')}>{data.autoRecommendation?.text ?? copy.weekly.autoEmpty}</p>
            {data.autoRecommendation && <AddRecommendation key={data.week} text={data.autoRecommendation.text} />}
          </SectionCard>
          <Narrative data={data} />
        </div>
      </div>
    </div>
  );
}

/** Haftanın kural tabanlı önerisini gerçek bir yapılacak maddesine çevirir (409 → zaten listede). */
function AddRecommendation({ text }: { text: string }) {
  const { copy } = useTodayCopy();
  const add = useAddSuggestion();
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <p role="status" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-success">
        <Check aria-hidden className="h-3.5 w-3.5" />
        {copy.todos.added}
      </p>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="mt-3 min-h-11 shadow-none sm:min-h-9"
      disabled={add.isPending}
      aria-busy={add.isPending}
      onClick={() =>
        add.mutate(
          { text, priority: 'medium', source: 'weekly_brief' },
          {
            onSuccess: () => {
              setDone(true);
              toast.success(copy.todos.added);
            },
            onError: (e) => {
              if (e instanceof TodayFetchError && e.status === 409) {
                setDone(true);
                toast(copy.todos.duplicate);
              } else toast.error(copy.todos.failed);
            },
          }
        )
      }
    >
      <Plus aria-hidden className="h-4 w-4" />
      {copy.weekly.addToTodos}
    </Button>
  );
}

function Trend({ t }: { t: WeeklyTheme }) {
  const { copy } = useTodayCopy();
  const d = t.count - t.prevCount;
  const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {copy.weekly.themePrev(t.prevCount)}
    </span>
  );
}

function Themes({ themes }: { themes: WeeklyTheme[] }) {
  const { copy } = useTodayCopy();
  const max = Math.max(1, ...themes.map((t) => t.count));
  return (
    <SectionCard title={copy.weekly.themesTitle} description={copy.weekly.themesDesc} density="compact">
      {themes.length === 0 ? (
        <p role="status" className="text-sm text-fg-muted">
          {copy.weekly.themesEmpty}
        </p>
      ) : (
        <ul className="space-y-3">
          {themes.map((t) => {
            const neutral = Math.max(0, t.count - t.positive - t.negative);
            return (
              <li key={t.label} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-fg">{t.label}</span>
                  <Trend t={t} />
                </div>
                <div aria-hidden className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-3" style={{ width: `${Math.max(12, (t.count / max) * 100)}%` }}>
                  {t.positive > 0 && <span className="bg-success" style={{ width: `${(t.positive / t.count) * 100}%` }} />}
                  {neutral > 0 && <span className="bg-fg-subtle/40" style={{ width: `${(neutral / t.count) * 100}%` }} />}
                  {t.negative > 0 && <span className="bg-danger" style={{ width: `${(t.negative / t.count) * 100}%` }} />}
                </div>
                <p className="mt-0.5 text-xs text-fg-muted">{copy.weekly.themeRow(t.count, t.positive, t.negative)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function Narrative({ data }: { data: WeeklyData }) {
  const { copy, tag } = useTodayCopy();
  const gen = useGenerateNarrative(data.week);
  const timeFmt = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
  const run = (regenerate: boolean) =>
    gen.mutate(regenerate, {
      onError: (e) => toast.error(e instanceof TodayFetchError && e.message ? e.message : copy.weekly.aiFailed),
    });
  return (
    <SectionCard
      title={copy.weekly.aiTitle}
      icon={<Sparkles />}
      tone="brand"
      density="compact"
      actions={<StatusBadge label={copy.weekly.aiBadge} tone="brand" size="sm" icon={null} />}
    >
      {data.narrative ? (
        <div className="space-y-2">
          <p className="whitespace-pre-line text-sm leading-relaxed text-fg">{data.narrative.text}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">{copy.weekly.aiGeneratedAt(timeFmt.format(new Date(data.narrative.generatedAt)))}</span>
            {data.aiAvailable && (
              <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run(true)} disabled={gen.isPending} aria-busy={gen.isPending}>
                {gen.isPending ? copy.weekly.aiGenerating : copy.weekly.aiRegenerate}
              </Button>
            )}
          </div>
        </div>
      ) : data.aiAvailable ? (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">{copy.weekly.aiDesc}</p>
          <Button size="sm" className="min-h-11 shadow-none sm:min-h-9" onClick={() => run(false)} disabled={gen.isPending} aria-busy={gen.isPending}>
            <Sparkles aria-hidden className="h-4 w-4" />
            {gen.isPending ? copy.weekly.aiGenerating : copy.weekly.aiGenerate}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">{copy.weekly.aiUnavailable}</p>
      )}
    </SectionCard>
  );
}

function WeeklyArchive({ current, onOpen }: { current: string | null; onOpen: (week: string) => void }) {
  const { copy, tag } = useTodayCopy();
  const fmt = useDayFormat();
  const q = useWeeklyArchive();
  const rows: WeeklyArchiveRow[] = q.data?.pages.flatMap((p) => p.items) ?? [];
  const num = (n: number | null, digits = 0) => (n == null ? '—' : n.toLocaleString(tag, { maximumFractionDigits: digits, minimumFractionDigits: digits }));
  return (
    <SectionCard
      title={copy.weekly.archiveTitle}
      description={copy.weekly.archiveDesc}
      density="flush"
      actions={
        rows.length > 0 ? (
          <Button variant="outline" size="sm" className="min-h-11 shadow-none sm:min-h-9" onClick={() => downloadArchiveCsv(rows, copy, tag, fmt.long)}>
            <Download aria-hidden className="h-4 w-4" />
            {copy.weekly.csv}
          </Button>
        ) : null
      }
    >
      <QueryState query={{ ...q, data: q.data ? rows : undefined }} skeleton="table" error={{ title: copy.weekly.errorTitle }} empty={{ title: copy.weekly.archiveEmpty, compact: true }}>
        {() => (
          <div className="min-w-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">{copy.weekly.archiveTitle}</caption>
                <thead>
                  <tr className="border-b border-subtle text-left text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-2 font-medium">{copy.weekly.archiveCols.week}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{copy.weekly.archiveCols.feedback}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{copy.weekly.archiveCols.avg}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{copy.weekly.archiveCols.negative}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{copy.weekly.archiveCols.response}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{copy.weekly.archiveCols.consumptions}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{copy.weekly.archiveCols.brief}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const active = r.week === current;
                    return (
                      <tr key={r.week} className={cn('border-b border-subtle last:border-0', active && 'bg-brand-subtle/50')}>
                        <th scope="row" className="px-4 py-1 text-left font-normal">
                          <button
                            type="button"
                            onClick={() => onOpen(r.week)}
                            aria-current={active ? 'true' : undefined}
                            className="inline-flex min-h-11 items-center rounded-control font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-9"
                          >
                            {copy.weekly.range(fmt.short(r.week), fmt.short(addDaysLocal(r.week, 6)))}
                            <span className="sr-only"> — {copy.weekly.archiveOpen}</span>
                          </button>
                        </th>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.feedback)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.avgRating, r.avgRating == null ? 0 : 1)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.negative)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{r.responseRate == null ? '—' : `%${num(r.responseRate)}`}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.consumptions)}</td>
                        <td className="px-4 py-1">{r.hasBrief ? <StatusBadge label={copy.weekly.hasBrief} tone="neutral" size="sm" /> : <span className="text-fg-subtle">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {q.hasNextPage && (
              <div className="border-t border-subtle px-4 py-3">
                <Button variant="outline" size="sm" className="min-h-11 shadow-none sm:min-h-9" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} aria-busy={q.isFetchingNextPage}>
                  {copy.weekly.archiveMore}
                </Button>
              </div>
            )}
          </div>
        )}
      </QueryState>
    </SectionCard>
  );
}

/**
 * Arşivi CSV olarak indirir (eski operations-brief CSV'si tek kolon anahtar/değer ve İngilizce
 * teknik anahtarlardı — B11). Yerelleştirilmiş başlıklar, UTF-8 BOM, TR'de `;` ayırıcı.
 */
function downloadArchiveCsv(rows: WeeklyArchiveRow[], copy: ReturnType<typeof useTodayCopy>['copy'], tag: string, long: (d: string) => string) {
  const sep = tag.startsWith('tr') ? ';' : ',';
  const esc = (v: string) => (/[";,\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const n = (v: number | null, digits = 0) => (v == null ? '' : v.toLocaleString(tag, { maximumFractionDigits: digits, useGrouping: false }));
  const c = copy.weekly.archiveCols;
  const header = [c.week, c.feedback, c.avg, c.negative, `${c.response} (%)`, c.consumptions, c.brief];
  const lines = rows.map((r) =>
    [
      `${long(r.week)} – ${long(addDaysLocal(r.week, 6))}`,
      n(r.feedback),
      n(r.avgRating, 1),
      n(r.negative),
      n(r.responseRate, 1),
      n(r.consumptions),
      r.hasBrief ? copy.weekly.hasBrief : '',
    ]
      .map(esc)
      .join(sep)
  );
  const blob = new Blob(['﻿' + [header.map(esc).join(sep), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `haftalik-rapor-${rows[rows.length - 1]?.week ?? ''}_${rows[0]?.week ?? ''}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function addDaysLocal(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
