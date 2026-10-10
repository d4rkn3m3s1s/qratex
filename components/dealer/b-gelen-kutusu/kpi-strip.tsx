'use client';

/**
 * Gelen Kutusu özeti: dönem seçici + 5 KPI (sunucu hesaplar, istemci biçimler) + tıklanabilir
 * puan dağılımı. "Yanıt bekleyen" kutusu "Yeni · en eski önce" görünümüne bağlantıdır.
 */
import { BarChart3, Clock3, Inbox, MessageSquareReply, Star, ThumbsDown } from 'lucide-react';
import { MetricGrid, MetricTile, type MetricValue } from '@/components/ds/data';
import { DateRangePicker, type DateRangeValue } from '@/components/ds/page';
import { SectionCard } from '@/components/ds/page';
import { QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { InboxSummary } from '@/lib/dealer-inbox/types';
import type { QueryLike } from '@/components/states';
import { useInboxCopy } from './copy';

function deltaOf(cur: number | null, prev: number | null, kind: 'absolute' | 'points', label: string, goodDirection: 'up' | 'down' = 'up') {
  if (cur == null || prev == null) return null;
  return { value: Math.round((cur - prev) * 100) / 100, kind, label, goodDirection };
}

export function KpiStrip({
  query,
  period,
  onPeriodChange,
  activeRating,
  onRating,
  pendingHref,
}: {
  query: QueryLike<InboxSummary>;
  period: DateRangeValue;
  onPeriodChange: (v: DateRangeValue) => void;
  activeRating: string;
  onRating: (rating: string) => void;
  pendingHref: string;
}) {
  const copy = useInboxCopy();
  return (
    <SectionCard
      title={copy.summaryTitle}
      icon={<BarChart3 aria-hidden />}
      density="compact"
      actions={
        <DateRangePicker
          value={period}
          onChange={onPeriodChange}
          presets={['last7', 'last30', 'last90', 'thisMonth', 'lastMonth']}
          allowCompare={false}
          maxDays={366}
          label={copy.summaryPeriod}
          touchTarget
        />
      }
    >
      <QueryState query={query} skeleton="stats" isEmpty={() => false}>
        {(s) => {
          const pending: MetricValue = { value: s.pending };
          const avg: MetricValue = {
            value: s.avgRating.value,
            fractionDigits: 2,
            n: s.avgRating.n,
            minN: 10,
            delta: deltaOf(s.avgRating.value, s.avgRating.previous, 'absolute', copy.vsPrevious),
          };
          const reply: MetricValue = {
            value: s.replyRate.value,
            format: 'percent',
            n: s.replyRate.n,
            delta: deltaOf(s.replyRate.value, s.replyRate.previous, 'points', copy.vsPrevious),
          };
          const median: MetricValue = { value: s.medianReplySeconds.value, format: 'duration', n: s.medianReplySeconds.n };
          const negative: MetricValue = {
            value: s.negativeShare.value,
            format: 'percent',
            n: s.negativeShare.n,
            delta: deltaOf(s.negativeShare.value, s.negativeShare.previous, 'points', copy.vsPrevious, 'down'),
          };
          const total = Object.values(s.distribution).reduce((a, b) => a + b, 0);
          return (
            <div className="space-y-4">
              <MetricGrid cols={5}>
                <MetricTile
                  label={copy.kpiPending}
                  metric={pending}
                  icon={<Inbox aria-hidden />}
                  tone={s.overdue > 0 ? 'danger' : s.pending > 0 ? 'warning' : 'success'}
                  hint={copy.kpiPendingHint(s.overdue)}
                  href={pendingHref}
                  size="compact"
                />
                <MetricTile label={copy.kpiAvg} metric={avg} icon={<Star aria-hidden />} size="compact" />
                <MetricTile label={copy.kpiReplyRate} metric={reply} icon={<MessageSquareReply aria-hidden />} size="compact" />
                <MetricTile label={copy.kpiMedianReply} metric={median} icon={<Clock3 aria-hidden />} size="compact" />
                <MetricTile
                  label={copy.kpiNegative}
                  metric={negative}
                  icon={<ThumbsDown aria-hidden />}
                  hint={copy.kpiNegativeHint}
                  size="compact"
                />
              </MetricGrid>

              <div>
                <h3 className="qx-small font-semibold text-fg">{copy.distributionTitle}</h3>
                <p className="qx-caption text-fg-muted">{copy.distributionHint}</p>
                <ul className="mt-2 grid gap-1 sm:max-w-xl">
                  {(['5', '4', '3', '2', '1'] as const).map((star) => {
                    const count = s.distribution[star];
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const active = activeRating === star;
                    return (
                      <li key={star}>
                        <button
                          type="button"
                          aria-pressed={active}
                          aria-label={copy.distributionAria(Number(star), count, active)}
                          onClick={() => onRating(active ? 'all' : star)}
                          className={cn(
                            'flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left transition-colors duration-fast ease-standard sm:min-h-9',
                            'hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active && 'bg-brand-subtle ring-1 ring-inset ring-brand-border'
                          )}
                        >
                          <span aria-hidden className="qx-small qx-num inline-flex w-8 shrink-0 items-center gap-0.5 text-fg">
                            {star}
                            <Star className="h-3 w-3 fill-warning text-warning" />
                          </span>
                          <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                            <span
                              className={cn('block h-full rounded-full', Number(star) <= 2 ? 'bg-danger' : Number(star) === 3 ? 'bg-warning' : 'bg-success')}
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span aria-hidden className="qx-caption qx-num w-10 shrink-0 text-right text-fg-muted">
                            {count}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        }}
      </QueryState>
    </SectionCard>
  );
}
