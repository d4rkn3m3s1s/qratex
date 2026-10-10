'use client';

/**
 * Bağış → Bağışlarım: kişisel bağış geçmişi ve makbuzlar (denetim #57, eksik özellik 2).
 * Makbuz `?receipt=` derin linkiyle açılır; defter satırı varsa puan defterine bağlanır.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronRight, Eye, EyeOff, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailSheet, KeyValueList } from '@/components/ds/data';
import { EmptyState, QueryState } from '@/components/states';
import type { DonationReceipt } from '@/lib/customer-wallet/donate/service';
import { fetchHistory, fetchReceipt, HISTORY_KEY, receiptKey, shouldRetry } from './api';
import { useMovesCopy } from './copy';
import { ProjectIcon } from './donate-parts';
import { useFormatters, type Formatters } from './format';
import { InfiniteFooter } from './infinite-footer';

export function HistoryTab({ onBrowse, receiptId, onOpenReceipt, onCloseReceipt }: {
  onBrowse: (() => void) | null;
  receiptId: string | null;
  onOpenReceipt: (id: string) => void;
  onCloseReceipt: () => void;
}) {
  const { copy, locale } = useMovesCopy();
  const fmt = useFormatters(locale);
  const q = useInfiniteQuery({
    queryKey: HISTORY_KEY,
    queryFn: ({ pageParam, signal }) => fetchHistory(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
    refetchOnWindowFocus: true, // PWA'ya dönüşte (ör. QR sonrası) taze veri
    retry: shouldRetry,
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  return (
    <>
      <QueryState
        query={q}
        skeleton="list"
        isEmpty={() => items.length === 0}
        empty={
          <EmptyState
            icon={Heart}
            title={copy.historyEmptyTitle}
            description={copy.historyEmptyDesc}
            action={
              onBrowse ? (
                <Button className="min-h-11" onClick={onBrowse}>
                  {copy.donateCta}
                </Button>
              ) : undefined
            }
          />
        }
      >
        <ul className="divide-y divide-subtle overflow-hidden rounded-card border border-subtle bg-surface-1">
          {items.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onOpenReceipt(d.id)}
                className="flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
              >
                <ProjectIcon icon={d.project.icon} category={d.project.category} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="qx-small block truncate font-medium text-fg">{d.project.name}</span>
                  <span className="qx-caption flex flex-wrap items-center gap-x-2 text-fg-muted">
                    <time dateTime={d.at}>{fmt.dayLongYear(d.at)}</time>
                    {d.impact ? <span>≈ {fmt.dec(d.impact.value)} {d.impact.unit}</span> : null}
                    <span className="inline-flex items-center gap-1">
                      {d.isPublic ? <Eye className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
                      {d.isPublic ? copy.visibilityPublic : copy.visibilityPrivate}
                    </span>
                  </span>
                </span>
                <span className="qx-small qx-num shrink-0 font-semibold text-fg">−{fmt.int(d.points)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <InfiniteFooter
          hasNextPage={!!q.hasNextPage}
          isFetchingNextPage={q.isFetchingNextPage}
          nextPageError={q.isFetchNextPageError}
          onLoadMore={() => q.fetchNextPage()}
          loadedCount={items.length}
        />
      </QueryState>

      <DetailSheet
        open={!!receiptId}
        id={receiptId}
        onOpenChange={(open) => {
          if (!open) onCloseReceipt();
        }}
        title={copy.receiptTitle}
        size="sm"
      >
        {(id: string) => <ReceiptDetail id={id} initial={items.find((i) => i.id === id) ?? null} fmt={fmt} />}
      </DetailSheet>
    </>
  );
}

function ReceiptDetail({ id, initial, fmt }: { id: string; initial: DonationReceipt | null; fmt: Formatters }) {
  const { copy } = useMovesCopy();
  const q = useQuery({
    queryKey: receiptKey(id),
    queryFn: ({ signal }) => fetchReceipt(id, signal),
    initialData: initial ?? undefined,
    staleTime: 60_000,
    retry: shouldRetry,
  });
  return (
    <QueryState query={q} skeleton="detail" error={{ title: copy.receiptNotFound }}>
      {(r) => (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <ProjectIcon icon={r.project.icon} category={r.project.category} />
            <div className="min-w-0">
              <p className="qx-small truncate font-semibold text-fg">{r.project.name}</p>
              <p className="qx-num text-2xl font-semibold text-fg">
                {fmt.int(r.points)} <span className="qx-small font-normal text-fg-muted">{copy.points}</span>
              </p>
            </div>
          </div>
          <KeyValueList
            items={[
              { id: 'no', label: copy.receiptFields.number, value: r.receiptNo, copyValue: r.receiptNo, mono: true },
              { id: 'date', label: copy.receiptFields.date, value: <time dateTime={r.at}>{fmt.dateTime(r.at)}</time> },
              {
                id: 'impact',
                label: copy.receiptFields.impact,
                value: r.impact ? `≈ ${fmt.dec(r.impact.value)} ${r.impact.unit}${r.impact.label ? ` · ${r.impact.label}` : ''}` : null,
                hidden: !r.impact,
              },
              { id: 'msg', label: copy.receiptFields.message, value: r.message, hidden: !r.message },
              { id: 'vis', label: copy.receiptFields.visibility, value: r.isPublic ? copy.visibilityPublic : copy.visibilityPrivate },
              {
                id: 'bal',
                label: copy.receiptFields.balanceAfter,
                value: r.balanceAfter != null ? `${fmt.int(r.balanceAfter)} ${copy.points}` : null,
                hidden: r.balanceAfter == null,
              },
              { id: 'ledger', label: copy.receiptFields.ledger, value: r.ledgerEntryId, mono: true, hidden: !r.ledgerEntryId },
            ]}
          />
          {r.ledgerEntryId ? (
            <Button asChild variant="outline" className="min-h-11 w-full">
              <Link href={`/customer/wallet/activity?entry=${encodeURIComponent(r.ledgerEntryId)}`}>{copy.openInLedger}</Link>
            </Button>
          ) : null}
        </div>
      )}
    </QueryState>
  );
}
