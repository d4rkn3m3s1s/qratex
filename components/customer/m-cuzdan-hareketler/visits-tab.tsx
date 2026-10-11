'use client';

/**
 * Cüzdan → Hareketler → Ziyaretler (eski /customer/consumptions).
 * Filtreden bağımsız özet kutuları aynı zamanda filtre (B1, #6); sunucu araması (B2, B5);
 * eski `?hasReview=` derin bağlantısı (B3); arama/filtre/boş/hata ayrı durumlar (B4);
 * yorum ödülü + bugünkü tavan (B7); işletme yanıtı rozeti (#31); ay başlıkları (#34).
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { MessageSquareReply, QrCode, CreditCard, Search, X, ChevronRight, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ds/a11y';
import { EmptyState, QueryState } from '@/components/states';
import { istanbulDay } from '@/components/ds/page/date-range';
import { cn } from '@/lib/utils';
import type { ReviewFilter, ReviewRewardPreview, VisitItem, VisitStats } from '@/lib/customer-wallet/activity/visits';
import { fetchVisitsPage, shouldRetry, visitsKey, type VisitsFilter, type VisitsPage } from './api';
import { useMovesCopy, type MovesCopy } from './copy';
import { useFormatters, type Formatters } from './format';
import { InfiniteFooter } from './infinite-footer';
import { GroupHeading, PlaceAvatar, Stars } from './parts';
import { useSearchParamState } from './use-param';
import { readVisitsFilter } from './filters';
import { consumptionVoiceHref } from '@/lib/navigation/deep-links';

const sameFilter = (a: VisitsFilter, b: VisitsFilter) => a.review === b.review && a.q === b.q && a.dealer === b.dealer;

export function VisitsTab({ initial }: { initial?: { filter: VisitsFilter; page: VisitsPage } | null }) {
  const { copy, locale } = useMovesCopy();
  const fmt = useFormatters(locale);
  const url = useSearchParamState();
  const filter = readVisitsFilter(url.get);

  const q = useInfiniteQuery({
    queryKey: visitsKey(filter),
    queryFn: ({ pageParam, signal }) => fetchVisitsPage(filter, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: initial && sameFilter(initial.filter, filter) ? { pages: [initial.page], pageParams: [null] } : undefined,
    placeholderData: keepPreviousData,
    staleTime: 10_000, // yorum yazıp geri dönünce liste kısa sürede tazelensin
    refetchOnWindowFocus: true, // PWA'ya dönüşte (ör. QR sonrası) taze veri
    retry: shouldRetry,
  });

  const first = q.data?.pages[0];
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const stats = first?.stats ?? null;
  const reward = first?.reward ?? null;
  const shelf = first?.pendingShelf ?? [];

  const setReview = (r: ReviewFilter) => url.patch({ review: r === 'all' ? null : r, hasReview: null });
  const clearAll = () => url.patch({ review: null, hasReview: null, q: null, dealer: null });
  const searching = !!filter.q || !!filter.dealer;
  const dealerName = filter.dealer ? items.find((i) => i.dealer.id === filter.dealer)?.dealer.name ?? null : null;

  return (
    <div className="space-y-4">
      {stats ? <ReviewFilterTiles stats={stats} value={filter.review} onChange={setReview} fmt={fmt} copy={copy} /> : null}

      {stats && stats.replied > 0 ? (
        <p className="qx-caption inline-flex items-center gap-1.5 text-fg-muted">
          <MessageSquareReply className="h-3.5 w-3.5" aria-hidden />
          {copy.replies(stats.replied)}
        </p>
      ) : null}

      {filter.review !== 'pending' && !searching && shelf.length > 0 && stats ? (
        <PendingShelf items={shelf} total={stats.pending} reward={reward} fmt={fmt} onSeeAll={() => setReview('pending')} />
      ) : null}

      {filter.review === 'pending' && reward ? <RewardNote reward={reward} fmt={fmt} copy={copy} /> : null}

      <SearchBox value={filter.q} onCommit={(v) => url.patch({ q: v || null })} copy={copy} />

      {filter.dealer ? (
        <div className="flex">
          <span className="qx-small inline-flex min-h-11 items-center gap-1 rounded-chip border border-brand-border bg-brand-subtle py-1 pl-3 pr-1 text-brand">
            {copy.dealerFilter(dealerName ?? copy.unnamedPlace)}
            <IconButton aria-label={copy.dealerFilterClear} icon={<X />} size="sm" variant="ghost" onClick={() => url.patch({ dealer: null })} />
          </span>
        </div>
      ) : null}

      <QueryState
        query={q}
        skeleton="list"
        isEmpty={() => items.length === 0}
        empty={
          searching || (filter.review !== 'all' && (stats?.total ?? 0) > 0) ? (
            filter.review === 'pending' && !searching ? (
              <EmptyState compact title={copy.pendingEmptyTitle} description={copy.pendingEmptyDesc} />
            ) : (
              <EmptyState
                compact
                title={copy.visitsNoMatchTitle}
                description={copy.visitsNoMatchDesc(filter.q)}
                action={
                  <Button variant="outline" className="min-h-11" onClick={clearAll}>
                    {copy.clearFilters}
                  </Button>
                }
              />
            )
          ) : (
            <EmptyState
              title={copy.visitsEmptyTitle}
              description={copy.visitsEmptyDesc}
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
                  <Link href="/customer/wallet/card">
                    <CreditCard className="mr-2 h-4 w-4" aria-hidden />
                    {copy.myCardCta}
                  </Link>
                </Button>
              }
            />
          )
        }
      >
        <VisitList items={items} fmt={fmt} reward={reward} />
        <InfiniteFooter
          hasNextPage={!!q.hasNextPage}
          isFetchingNextPage={q.isFetchingNextPage}
          nextPageError={q.isFetchNextPageError}
          onLoadMore={() => q.fetchNextPage()}
          loadedCount={items.length}
        />
      </QueryState>
    </div>
  );
}

function ReviewFilterTiles({
  stats,
  value,
  onChange,
  fmt,
  copy,
}: {
  stats: VisitStats;
  value: ReviewFilter;
  onChange: (r: ReviewFilter) => void;
  fmt: Formatters;
  copy: MovesCopy;
}) {
  const tiles: Array<{ v: ReviewFilter; label: string; n: number }> = [
    { v: 'all', label: copy.visitsAll, n: stats.total },
    { v: 'pending', label: copy.visitsPending, n: stats.pending },
    { v: 'reviewed', label: copy.visitsReviewed, n: stats.reviewed },
  ];
  return (
    <div role="group" aria-label={copy.visitsFilterLabel} className="grid grid-cols-3 gap-2">
      {tiles.map((t) => {
        const active = value === t.v;
        return (
          <button
            key={t.v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.v)}
            className={cn(
              'min-h-16 rounded-card border px-3 py-2.5 text-left transition-colors duration-fast ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              active ? 'border-brand-border bg-brand-subtle' : 'border-subtle bg-surface-1 hover:bg-surface-muted',
            )}
          >
            <span className={cn('qx-caption block truncate', active ? 'text-brand' : 'text-fg-muted')}>{t.label}</span>
            <span className="qx-num mt-0.5 block text-xl font-semibold text-fg">{fmt.int(t.n)}</span>
          </button>
        );
      })}
    </div>
  );
}

function RewardNote({ reward, fmt, copy }: { reward: ReviewRewardPreview; fmt: Formatters; copy: MovesCopy }) {
  const capped = reward.remainingToday !== null && reward.remainingToday <= 0;
  return (
    <p className={cn('qx-caption rounded-control border px-3 py-2', capped ? 'border-warning-border bg-warning-subtle text-warning' : 'border-subtle bg-surface-1 text-fg-muted')}>
      {capped
        ? copy.rewardCapped
        : reward.remainingToday !== null
          ? copy.rewardRemaining(fmt.int(reward.remainingToday))
          : copy.shelfDesc}
    </p>
  );
}

/** Gösterilen ödül tavanı aşamaz: vaat edilen puan = min(ödül, bugünkü kalan). */
function promised(points: number, reward: ReviewRewardPreview | null): number {
  if (!reward || reward.remainingToday === null) return points;
  return Math.max(0, Math.min(points, reward.remainingToday));
}

function RewardChip({ reward, fmt, copy }: { reward: ReviewRewardPreview | null; fmt: Formatters; copy: MovesCopy }) {
  if (!reward) return null;
  const base = promised(reward.base, reward);
  if (base <= 0) return null;
  return (
    <span className="qx-caption qx-num inline-flex items-center rounded-chip bg-success-subtle px-2 py-0.5 font-semibold text-success">
      {copy.rewardChip(fmt.int(base))}
    </span>
  );
}

function PendingShelf({
  items,
  total,
  reward,
  fmt,
  onSeeAll,
}: {
  items: VisitItem[];
  total: number;
  reward: ReviewRewardPreview | null;
  fmt: Formatters;
  onSeeAll: () => void;
}) {
  const { copy, locale } = useMovesCopy();
  const detailed = reward ? promised(reward.detailed, reward) : 0;
  const base = reward ? promised(reward.base, reward) : 0;
  return (
    <section aria-labelledby="pending-shelf-title" className="rounded-card border border-subtle bg-surface-1 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="pending-shelf-title" className="qx-h3 text-fg">
            {copy.shelfTitle(total)}
          </h2>
          <p className="qx-caption mt-0.5 text-fg-muted">
            {reward && reward.remainingToday !== null && reward.remainingToday <= 0 ? copy.rewardCapped : copy.shelfDesc}
          </p>
        </div>
        <Button variant="ghost" className="min-h-11 shrink-0" onClick={onSeeAll}>
          {copy.shelfSeeAll}
          <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
        </Button>
      </div>
      <ul className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        {items.map((v) => (
          <li key={v.id} className="w-[15rem] shrink-0 snap-start">
            <Link
              href={consumptionVoiceHref(v.id)}
              className="flex h-full flex-col gap-2 rounded-control border border-subtle bg-surface-0 p-3 transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2">
                <PlaceAvatar name={v.dealer.name} logo={v.dealer.logo} locale={locale} size={32} />
                <span className="min-w-0">
                  <span className="qx-small block truncate font-medium text-fg">{v.dealer.name ?? copy.unnamedPlace}</span>
                  <span className="qx-caption block truncate text-fg-muted">
                    <time dateTime={v.at}>{fmt.relative(v.at)}</time>
                    {v.product ? ` · ${v.product.name}` : ''}
                  </span>
                </span>
              </span>
              <span className="mt-auto flex flex-wrap items-center gap-1.5">
                {base > 0 ? (
                  <span className="qx-caption qx-num rounded-chip bg-success-subtle px-2 py-0.5 font-semibold text-success">
                    {copy.rewardChip(fmt.int(base))}
                  </span>
                ) : null}
                {reward && detailed > base ? (
                  <span className="qx-caption text-fg-muted">{copy.rewardDetailed(fmt.int(detailed), reward.detailedMinChars)}</span>
                ) : null}
              </span>
              <span className="qx-small inline-flex items-center gap-1 font-medium text-brand">
                <PenLine className="h-3.5 w-3.5" aria-hidden />
                {copy.writeReview}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SearchBox({ value, onCommit, copy }: { value: string; onCommit: (v: string) => void; copy: MovesCopy }) {
  const [text, setText] = useState(value);
  useEffect(() => setText((prev) => (prev.trim() === value ? prev : value)), [value]);
  useEffect(() => {
    if (text.trim() === value) return;
    const t = window.setTimeout(() => onCommit(text.trim().slice(0, 80)), 300);
    return () => window.clearTimeout(t);
  }, [text, value, onCommit]);
  return (
    <div className="relative" role="search">
      <label htmlFor="visits-search" className="sr-only">
        {copy.searchLabel}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <Input
        id="visits-search"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={text}
        maxLength={80}
        placeholder={copy.searchPlaceholder}
        onChange={(e) => setText(e.target.value)}
        className="h-11 pl-9 pr-11 text-base sm:text-sm"
      />
      {text ? (
        <span className="absolute right-1 top-1/2 -translate-y-1/2">
          <IconButton
            aria-label={copy.clearSearch}
            icon={<X />}
            size="sm"
            variant="ghost"
            onClick={() => {
              setText('');
              onCommit('');
            }}
          />
        </span>
      ) : null}
    </div>
  );
}

function VisitList({ items, fmt, reward }: { items: VisitItem[]; fmt: Formatters; reward: ReviewRewardPreview | null }) {
  const { copy, locale } = useMovesCopy();
  const currentYear = istanbulDay().slice(0, 4);
  const groups = useMemo(() => {
    const out: Array<{ month: string; rows: VisitItem[] }> = [];
    for (const it of items) {
      const month = istanbulDay(it.at).slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.month === month) last.rows.push(it);
      else out.push({ month, rows: [it] });
    }
    return out;
  }, [items]);

  return (
    <div>
      {groups.map((g) => {
        const headingId = `visits-month-${g.month}`;
        return (
          <Fragment key={g.month}>
            <GroupHeading id={headingId}>{fmt.monthHeading(g.month, currentYear)}</GroupHeading>
            <ul aria-labelledby={headingId} className="divide-y divide-subtle overflow-hidden rounded-card border border-subtle bg-surface-1">
              {g.rows.map((v) => {
                const place = v.dealer.name ?? copy.unnamedPlace;
                const when = fmt.relative(v.at);
                const status =
                  v.review.state === 'pending'
                    ? copy.visitsPending
                    : v.review.state === 'removed'
                      ? copy.reviewRemoved
                      : `${copy.ratingAria(v.review.rating)}${v.review.dealerReplied ? `, ${copy.dealerReplied}` : ''}`;
                return (
                  <li key={v.id}>
                    <Link
                      href={consumptionVoiceHref(v.id)}
                      aria-label={copy.visitAria(place, v.product?.name ?? '', when, status)}
                      className="flex min-h-16 items-start gap-3 px-3 py-3 transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
                    >
                      <PlaceAvatar name={v.dealer.name} logo={v.dealer.logo} locale={locale} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="qx-small truncate font-medium text-fg">{place}</span>
                          {v.amount != null ? <span className="qx-small qx-num shrink-0 text-fg">{fmt.money(v.amount)}</span> : null}
                        </span>
                        <span className="qx-caption block truncate text-fg-muted">
                          {v.product ? (
                            <>
                              {v.product.categoryIcon ? <span aria-hidden>{v.product.categoryIcon} </span> : null}
                              {v.product.name} ·{' '}
                            </>
                          ) : null}
                          <time dateTime={v.at}>{when}</time>
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-2">
                          {v.review.state === 'pending' ? (
                            <>
                              <span className="qx-caption inline-flex items-center gap-1 font-medium text-brand">
                                <PenLine className="h-3 w-3" aria-hidden />
                                {copy.writeReview}
                              </span>
                              <RewardChip reward={reward} fmt={fmt} copy={copy} />
                            </>
                          ) : v.review.state === 'removed' ? (
                            <span className="qx-caption text-fg-subtle">{copy.reviewRemoved}</span>
                          ) : (
                            <>
                              <Stars value={v.review.rating} label={copy.ratingAria(v.review.rating)} />
                              {v.review.dealerReplied ? (
                                <span className="qx-caption inline-flex items-center gap-1 rounded-chip bg-info-subtle px-2 py-0.5 text-info">
                                  <MessageSquareReply className="h-3 w-3" aria-hidden />
                                  {copy.dealerReplied}
                                </span>
                              ) : null}
                            </>
                          )}
                        </span>
                        {v.review.state === 'reviewed' && v.review.excerpt ? (
                          <span className="qx-caption mt-1 line-clamp-2 block text-fg-muted">“{v.review.excerpt}”</span>
                        ) : null}
                      </span>
                    </Link>
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
