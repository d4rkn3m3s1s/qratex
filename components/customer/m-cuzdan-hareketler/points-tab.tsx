'use client';

/**
 * Cüzdan → Hareketler → Puan: PointsLedger tabanlı puan defteri.
 * Kazanç/harcama yönü, kaynak grubu filtresi (URL'de), İstanbul gününe göre gruplu liste,
 * imleçli sonsuz kaydırma, satır → makbuz çekmecesi (`?entry=` derin linki).
 */
import { Fragment, useMemo } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query';
import { Clock, QrCode, Gamepad2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { DetailSheet, KeyValueList } from '@/components/ds/data';
import { EmptyState, QueryState } from '@/components/states';
import { istanbulDay } from '@/components/ds/page/date-range';
import { cn } from '@/lib/utils';
import { GROUP_LABELS, SOURCE_GROUPS, sourceLabel } from '@/lib/customer-wallet/activity/sources';
import type { PointsEntry } from '@/lib/customer-wallet/activity/points-history';
import { fetchPointsEntry, fetchPointsPage, pointsKey, shouldRetry, type PointsFilter, type PointsPage } from './api';
import { useMovesCopy } from './copy';
import { useFormatters, type Formatters } from './format';
import { InfiniteFooter } from './infinite-footer';
import { GroupHeading, IconTile, StatStrip, iconForSource } from './parts';
import { useSearchParamState } from './use-param';
import { readPointsFilter } from './filters';
import { EarnGuidePanel } from './earn-guide';
import type { EarnGuide } from '@/lib/economy/earn-guide';

export function PointsTab({
  initial,
  guide = null,
}: {
  initial?: { filter: PointsFilter; page: PointsPage } | null;
  guide?: EarnGuide | null;
}) {
  const { copy, locale } = useMovesCopy();
  const fmt = useFormatters(locale);
  const url = useSearchParamState();
  const filter = readPointsFilter(url.get);
  const entryId = url.get('entry');
  const filtered = filter.dir !== 'all' || filter.group !== null;

  const useInitial = !!initial && initial.filter.dir === filter.dir && initial.filter.group === filter.group;
  const q = useInfiniteQuery({
    queryKey: pointsKey(filter),
    queryFn: ({ pageParam, signal }) => fetchPointsPage(filter, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: useInitial && initial ? { pages: [initial.page], pageParams: [null] } : undefined,
    placeholderData: keepPreviousData,
    staleTime: 10_000, // yorum yazıp geri dönünce liste kısa sürede tazelensin
    refetchOnWindowFocus: true, // PWA'ya dönüşte (ör. QR sonrası) taze veri
    retry: shouldRetry,
  });

  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const overview = q.data?.pages[0]?.overview ?? null;

  const dirOptions = (['all', 'earn', 'spend'] as const).map((v) => ({ value: v, label: copy.dir[v] }));
  const groupOptions = [
    { value: 'all', label: copy.allSources },
    ...SOURCE_GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g][locale] })),
  ];

  const nextPageError = q.isFetchNextPageError;

  return (
    <div className="space-y-4">
      {overview ? (
        <div className="space-y-2">
          <StatStrip
            label={copy.balance}
            items={[
              { id: 'b', label: copy.balance, value: fmt.int(overview.balance) },
              { id: 'e', label: copy.earnedThisMonth, value: `+${fmt.int(overview.earnedThisMonth)}`, tone: 'success' },
              { id: 's', label: copy.spentThisMonth, value: fmt.int(overview.spentThisMonth) },
            ]}
          />
          {overview.pending > 0 ? (
            <p className="qx-caption inline-flex items-center gap-1.5 text-fg-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {copy.pendingHint(fmt.int(overview.pending))}
            </p>
          ) : null}
        </div>
      ) : null}

      {guide ? <EarnGuidePanel guide={guide} /> : null}

      <div className="space-y-2">
        <ChoiceChips
          aria-label={copy.direction}
          size="sm"
          options={dirOptions}
          value={filter.dir}
          onChange={(v) => url.patch({ dir: v && v !== 'all' ? v : null, entry: null })}
        />
        <ChoiceChips
          aria-label={copy.sourceFilter}
          size="sm"
          scroll
          options={groupOptions}
          value={filter.group ?? 'all'}
          onChange={(v) => url.patch({ src: v && v !== 'all' ? v : null, entry: null })}
        />
      </div>

      <QueryState
        query={q}
        skeleton="list"
        isEmpty={() => items.length === 0}
        empty={
          filtered ? (
            <EmptyState
              compact
              title={copy.pointsNoMatchTitle}
              description={copy.pointsNoMatchDesc}
              action={
                <Button variant="outline" className="min-h-11" onClick={() => url.patch({ dir: null, src: null })}>
                  {copy.clearFilters}
                </Button>
              }
            />
          ) : (
            <EmptyState
              title={copy.pointsEmptyTitle}
              description={copy.pointsEmptyDesc}
              action={
                <Button asChild className="min-h-11">
                  <Link href="/customer/scan">
                    <QrCode className="mr-2 h-4 w-4" aria-hidden />
                    {copy.scanCta}
                  </Link>
                </Button>
              }
              secondaryAction={
                <Button asChild variant="outline" className="min-h-11">
                  <Link href="/customer/games">
                    <Gamepad2 className="mr-2 h-4 w-4" aria-hidden />
                    {copy.playCta}
                  </Link>
                </Button>
              }
            />
          )
        }
      >
        <EntryList items={items} fmt={fmt} onOpen={(id) => url.patch({ entry: id })} />
        <InfiniteFooter
          hasNextPage={!!q.hasNextPage}
          isFetchingNextPage={q.isFetchingNextPage}
          nextPageError={nextPageError}
          onLoadMore={() => q.fetchNextPage()}
          loadedCount={items.length}
        />
      </QueryState>

      {overview && overview.unlistedBalance > 0 && !filtered && !q.hasNextPage ? (
        <aside className="rounded-card border border-subtle bg-surface-1 p-4" aria-labelledby="unlisted-title">
          <p id="unlisted-title" className="qx-small font-semibold text-fg">
            {copy.unlistedTitle}: <span className="qx-num">{fmt.int(overview.unlistedBalance)}</span> {copy.points}
          </p>
          <p className="qx-caption mt-1 text-fg-muted">{copy.unlistedDesc(fmt.int(overview.unlistedBalance))}</p>
        </aside>
      ) : null}

      <EntrySheet
        id={entryId}
        known={items}
        fmt={fmt}
        onClose={() => url.patch({ entry: null })}
      />
    </div>
  );
}

function EntryList({ items, fmt, onOpen }: { items: PointsEntry[]; fmt: Formatters; onOpen: (id: string) => void }) {
  const { copy, locale } = useMovesCopy();
  const today = istanbulDay();
  const groups = useMemo(() => {
    const out: Array<{ day: string; rows: PointsEntry[] }> = [];
    for (const it of items) {
      const day = istanbulDay(it.at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.rows.push(it);
      else out.push({ day, rows: [it] });
    }
    return out;
  }, [items]);

  return (
    <div>
      {groups.map((g) => {
        const headingId = `pts-day-${g.day}`;
        return (
          <Fragment key={g.day}>
            <GroupHeading id={headingId}>{fmt.dayHeading(g.day, { today: copy.today, yesterday: copy.yesterday }, today)}</GroupHeading>
            <ul aria-labelledby={headingId} className="qx-fx-stagger divide-y divide-subtle overflow-hidden rounded-card border border-subtle bg-surface-1">
              {g.rows.map((e) => {
                const label = sourceLabel(e.source, locale);
                const earn = e.delta > 0;
                const when = fmt.time(e.at);
                const Icon = iconForSource(e.source, e.group);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(e.id)}
                      aria-label={(earn ? copy.earnedAria : copy.spentAria)(fmt.int(Math.abs(e.delta)), label, `${when}${e.dealerName ? `, ${e.dealerName}` : ''}`)}
                      className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
                    >
                      <IconTile icon={e.status === 'reversed' ? Undo2 : Icon} tone={earn ? 'success' : 'neutral'} />
                      <span className="min-w-0 flex-1">
                        <span className="qx-small block truncate font-medium text-fg">{label}</span>
                        <span className="qx-caption flex flex-wrap items-center gap-x-2 text-fg-muted">
                          <time dateTime={e.at}>{when}</time>
                          {e.dealerName ? <span className="truncate">{e.dealerName}</span> : null}
                          {e.status === 'pending' ? (
                            <span className="inline-flex items-center gap-1 text-warning">
                              <Clock className="h-3 w-3" aria-hidden />
                              {copy.statusPending}
                            </span>
                          ) : null}
                          {e.status === 'reversed' ? <span className="text-fg-subtle">{copy.statusReversed}</span> : null}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={cn(
                            'qx-num block font-semibold',
                            earn ? 'text-success' : 'text-fg',
                            e.status === 'reversed' && 'line-through decoration-1',
                          )}
                        >
                          {fmt.signed(e.delta)}
                        </span>
                        {e.xp > 0 ? <span className="qx-caption qx-num block text-fg-subtle">{copy.xp(fmt.int(e.xp))}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Fragment>
        );
      })}
    </div>
  );
}

function EntrySheet({ id, known, fmt, onClose }: { id: string | null; known: PointsEntry[]; fmt: Formatters; onClose: () => void }) {
  const { copy } = useMovesCopy();
  const fromList = id ? known.find((k) => k.id === id) ?? null : null;
  return (
    <DetailSheet
      open={!!id}
      id={id}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.entryTitle}
      size="sm"
    >
      {(entryId: string) => <EntryDetail id={entryId} initial={fromList} fmt={fmt} />}
    </DetailSheet>
  );
}

function EntryDetail({ id, initial, fmt }: { id: string; initial: PointsEntry | null; fmt: Formatters }) {
  const { copy, locale } = useMovesCopy();
  const q = useQuery({
    queryKey: ['wallet-activity', 'entry', id],
    queryFn: ({ signal }) => fetchPointsEntry(id, signal),
    initialData: initial ?? undefined,
    staleTime: 60_000,
    retry: shouldRetry,
  });
  return (
    <QueryState query={q} skeleton="detail" error={{ title: copy.entryNotFound }}>
      {(e) => {
        const earn = e.delta > 0;
        const status = e.status === 'pending' ? copy.statusPending : e.status === 'reversed' ? copy.statusReversed : copy.statusPosted;
        return (
          <div className="space-y-4">
            <p className={cn('qx-num text-3xl font-semibold', earn ? 'text-success' : 'text-fg')}>
              {fmt.signed(e.delta)} <span className="qx-small font-normal text-fg-muted">{copy.points}</span>
            </p>
            <KeyValueList
              items={[
                { id: 'src', label: copy.entryFields.source, value: sourceLabel(e.source, locale) },
                { id: 'date', label: copy.entryFields.date, value: <time dateTime={e.at}>{fmt.dateTime(e.at)}</time> },
                { id: 'place', label: copy.entryFields.place, value: e.dealerName, hidden: !e.dealerName },
                { id: 'xp', label: copy.entryFields.xp, value: e.xp > 0 ? copy.xp(fmt.int(e.xp)) : null, hidden: e.xp <= 0 },
                {
                  id: 'bal',
                  label: copy.entryFields.balanceAfter,
                  value: e.balanceAfter != null ? `${fmt.int(e.balanceAfter)} ${copy.points}` : null,
                  hidden: e.balanceAfter == null,
                },
                { id: 'st', label: copy.entryFields.status, value: e.legacy ? `${status} · ${copy.legacyNote}` : status },
                { id: 'rec', label: copy.entryFields.record, value: e.id, copyValue: e.id, mono: true },
              ]}
            />
            {e.href ? (
              <Button asChild variant="outline" className="min-h-11 w-full">
                <Link href={e.href}>{copy.goToSource}</Link>
              </Button>
            ) : null}
          </div>
        );
      }}
    </QueryState>
  );
}

