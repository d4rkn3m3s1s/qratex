'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { QueryState } from '@/components/states';
import { StatusBadge } from '@/components/ds/data';
import {
  INTENT_LABEL,
  PERIOD_LABEL,
  SENTIMENT_LABEL,
  labelOf,
  urgencyBucket,
  URGENCY_BUCKETS,
  type AiOpsPeriod,
  type SignalKind,
} from '@/lib/admin-ai-ops/contract';
import { aiOpsKeys, fetchSignalFeedbacks } from './api';
import { KindBadge, fmtDateTime, fmtInt } from './parts';

export type SignalPick = { signal: SignalKind; value?: string; dealerId?: string; label?: string } | null;

const SIZE = 20;

/** Sinyalden (acil, tema, niyet…) o sinyali taşıyan geri bildirimlerin listesine iniş. */
export function SignalSheet({ pick, period, onClose }: { pick: SignalPick; period: AiOpsPeriod; onClose: () => void }) {
  return (
    <Sheet open={!!pick} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {pick ? <SheetBody key={`${pick.signal}:${pick.value ?? ''}:${pick.dealerId ?? ''}:${period}`} pick={pick} period={period} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({ pick, period }: { pick: NonNullable<SignalPick>; period: AiOpsPeriod }) {
  const [page, setPage] = useState(1);
  const q = { period, signal: pick.signal, value: pick.value, dealerId: pick.dealerId, page, size: SIZE };
  const query = useQuery({ queryKey: aiOpsKeys.signalFeedbacks(q), queryFn: () => fetchSignalFeedbacks(q), placeholderData: keepPreviousData });
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  return (
    <>
      <SheetHeader>
        <SheetTitle>{query.data?.title ?? pick.label ?? 'Geri bildirimler'}</SheetTitle>
        <SheetDescription>
          {PERIOD_LABEL[period]} · {query.data ? `${fmtInt(total)} kayıt` : 'yükleniyor'} · silinmiş kayıtlar ve sezgisel (sahte) sinyaller hariç.
        </SheetDescription>
      </SheetHeader>
      <div className="mt-4">
        <QueryState
          query={query}
          skeleton="list"
          isEmpty={(d) => d.items.length === 0}
          empty={{ title: 'Kayıt yok', description: 'Bu dönemde bu sinyali taşıyan geri bildirim bulunmuyor.' }}
          showRefreshing
        >
          {(d) => (
            <ul className="space-y-3" aria-label="Geri bildirimler">
              {d.items.map((f) => {
                const ub = urgencyBucket(f.urgency);
                return (
                  <li key={f.id} className="rounded-lg border border-border bg-surface-1 p-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                      <span className="font-medium text-fg">{f.dealerName}</span>
                      <span aria-hidden>·</span>
                      <time dateTime={f.at}>{fmtDateTime(f.at)}</time>
                      <span aria-hidden>·</span>
                      <span>{f.rating} yıldız</span>
                    </div>
                    <p className="mt-1.5 text-sm text-fg">{f.preview || <span className="text-fg-muted">Metinsiz geri bildirim</span>}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <KindBadge kind={f.kind} />
                      {f.sentiment ? <StatusBadge size="sm" icon={null} label={labelOf(SENTIMENT_LABEL, f.sentiment)} tone={f.sentiment === 'negative' ? 'danger' : f.sentiment === 'positive' ? 'success' : 'neutral'} /> : null}
                      {f.intent ? <StatusBadge size="sm" icon={null} label={labelOf(INTENT_LABEL, f.intent)} tone="neutral" /> : null}
                      {ub ? <StatusBadge size="sm" icon={null} srPrefix="Aciliyet" label={`Aciliyet: ${URGENCY_BUCKETS.find((b) => b.key === ub)?.label}`} tone={ub === 'critical' || ub === 'high' ? 'warning' : 'neutral'} /> : null}
                      {f.isToxic ? <StatusBadge size="sm" label="Toksik" tone="danger" /> : null}
                      <Link
                        href={`/admin/feedbacks?id=${encodeURIComponent(f.id)}`}
                        className="ml-auto inline-flex min-h-[44px] items-center gap-1 rounded px-2 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-8"
                      >
                        Ayrıntı <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </QueryState>
        {pages > 1 ? (
          <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Sayfalama">
            <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-9" disabled={page <= 1 || query.isFetching} onClick={() => setPage((p) => p - 1)}>
              Önceki
            </Button>
            <span className="text-sm tabular-nums text-fg-muted" aria-live="polite">
              Sayfa {page} / {pages}
            </span>
            <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-9" disabled={page >= pages || query.isFetching} onClick={() => setPage((p) => p + 1)}>
              Sonraki
            </Button>
          </nav>
        ) : null}
      </div>
    </>
  );
}
