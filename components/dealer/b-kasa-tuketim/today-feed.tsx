'use client';

/** Kasa "Bugün" akışı: günün özeti + son 10 işlem + geri alma (15 dk). */
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { QueryState } from '@/components/states';
import type { LedgerPage, LedgerRow } from '@/lib/dealer/kasa/types';
import { formatMoney, formatTime } from './api';
import { RatingBadge, VoidButton, VoidDialog } from './parts';
import { useKasaCopy } from './copy';
import { useNewIds } from '@/components/fx/event-fx';
import { cn } from '@/lib/utils';

type QueryLike = {
  data: LedgerPage | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
};

export function TodayFeed({ query, onVoided }: { query: QueryLike; onVoided: () => void }) {
  const { copy } = useKasaCopy();
  const c = copy.kasa.today;
  const isNewRow = useNewIds(query.data?.rows.map((r) => r.id) ?? [], !!query.data);
  const [voidRow, setVoidRow] = useState<LedgerRow | null>(null);

  return (
    <section aria-labelledby="kasa-today-title" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="kasa-today-title" className="qx-h3">
          {c.title}
        </h2>
        <Link
          href="/dealer/consumptions?range=today"
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {c.all}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <QueryState
        query={query}
        skeleton="list"
        error={{ title: c.error }}
        onRetry={() => query.refetch()}
        isEmpty={() => false}
      >
        {(data: LedgerPage) => {
          const s = data.summary.current;
          return (
            <div className="space-y-3">
              <dl className="grid grid-cols-3 gap-2">
                <Stat label={c.count} value={String(s.count)} />
                <Stat label={c.revenue} value={formatMoney(s.revenue, copy.locale)} />
                <Stat label={c.reviewRate} value={s.reviewRate == null ? '—' : `%${s.reviewRate.toLocaleString(copy.locale)}`} />
              </dl>
              {data.rows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-fg-muted">{c.empty}</p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {data.rows.map((r) => (
                    <li key={r.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', isNewRow(r.id) && 'qx-fx-row-in')}>
                      <span className="qx-num w-11 text-xs text-fg-muted">{formatTime(r.createdAt, copy.locale)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.customer.displayName ?? copy.kasa.customer.unnamed}</span>
                        <span className="block truncate text-xs text-fg-muted">{r.product?.name ?? copy.common.noProduct}</span>
                      </span>
                      <span className="qx-num text-sm">{r.amount === 0 ? copy.common.free : formatMoney(r.amount, copy.locale)}</span>
                      {r.review ? <RatingBadge rating={r.review.rating} /> : null}
                      <VoidButton createdAt={r.createdAt} voidable={r.voidable} onClick={() => setVoidRow(r)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        }}
      </QueryState>
      {voidRow && (
        <VoidDialog
          open
          onOpenChange={(o) => !o && setVoidRow(null)}
          consumptionId={voidRow.id}
          summary={{
            label: voidRow.product?.name ?? copy.common.noProduct,
            amount: formatMoney(voidRow.amount, copy.locale),
            points: voidRow.passivePoints,
          }}
          onDone={() => {
            setVoidRow(null);
            onVoided();
          }}
        />
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="qx-num truncate text-base font-semibold">{value}</dd>
    </div>
  );
}
