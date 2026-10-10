'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Award, Crown, Flag, Gift, Loader2, MessageCircleReply, MessageSquare, Store, Target } from 'lucide-react';
import { ChoiceChips, useDsLocale } from '@/components/ds/a11y';
import { BadgeGlyph } from '@/components/ds/play';
import { SectionCard } from '@/components/ds/page';
import { QueryState, SkeletonList } from '@/components/states';
import { Reveal } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { formatDate, formatNumber, getMeCopy, type MeCopy, type MeLocale } from '../copy';
import { fetchEnvelope } from '../fetch-json';
import { JOURNEY_FILTERS, type JourneyEvent, type JourneyFilter, type JourneyPage } from '../types';
import { FOCUS_RING, SOFT_BUTTON } from './styles';

const ICON: Record<JourneyEvent['type'], ReactNode> = {
  review: <MessageSquare className="size-4" />,
  heard: <MessageCircleReply className="size-4" />,
  badge: <Award className="size-4" />,
  reward: <Gift className="size-4" />,
  visit: <Store className="size-4" />,
  quest: <Target className="size-4" />,
  level: <Flag className="size-4" />,
  league: <Crown className="size-4" />,
};

function eventText(e: JourneyEvent, c: MeCopy['progress'], locale: MeLocale): string {
  const ev = c.events;
  switch (e.type) {
    case 'review':
      return ev.review(e.data.place, formatNumber(e.data.rating, locale));
    case 'heard':
      return ev.heard(e.data.place);
    case 'badge':
      return ev.badge(e.data.name);
    case 'reward':
      return ev.reward(e.data.name);
    case 'visit':
      return ev.visit(e.data.place, e.data.product);
    case 'quest':
      return ev.quest(e.data.name);
    case 'level':
      return ev.level(formatNumber(e.data.to, locale));
    case 'league':
      return ev.league(e.data.name);
  }
}

function monthKey(iso: string): string {
  // İstanbul takvim ayı (gece yarısı sınırında doğru gruplama).
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' }).format(new Date(iso));
}

/**
 * Yolculuğun — imleçli, süzülebilir, tıklanabilir olay akışı. İlk sayfa sunucudan gelir
 * ("Tümü"); süzgeç ve "Daha fazla göster" bu adadan. Tek sütun + sol zaman çizgisi
 * (eski zikzak yerleşimin yerine), ay başlıkları, `<ol>` + `<time>` (journey-score bulgu 13).
 */
export function JourneyFeed({ initial, memberSince }: { initial: JourneyPage | null; memberSince: string }) {
  const locale = useDsLocale();
  const c = getMeCopy(locale).progress;
  const [filter, setFilter] = useState<JourneyFilter>('all');

  const query = useInfiniteQuery({
    queryKey: ['me-progress', 'journey', filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ filter });
      if (pageParam) params.set('cursor', pageParam);
      return fetchEnvelope<JourneyPage>(`/api/customer/me/progress/journey?${params}`, signal);
    },
    getNextPageParam: (last) => last.nextCursor,
    initialData: filter === 'all' && initial ? { pages: [initial], pageParams: [null] } : undefined,
    staleTime: 60_000,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const flat = { ...query, data: query.data ? { items } : undefined };

  return (
    <SectionCard id="yolculuk" title={c.journeyTitle} description={c.journeyDescription}>
      <div className="space-y-4">
        <ChoiceChips<JourneyFilter>
          aria-label={c.filterLabel}
          size="sm"
          scroll
          value={filter}
          onChange={(v) => v && setFilter(v)}
          options={JOURNEY_FILTERS.map((f) => ({ value: f, label: c.filters[f] }))}
        />

        <QueryState
          query={flat}
          skeleton={<SkeletonList />}
          empty={{ title: c.journeyEmpty }}
          onRetry={() => query.refetch()}
        >
          {() => (
            <div className="space-y-4">
              <ol className="space-y-1">
                {items.map((e, i) => {
                  const showMonth = i === 0 || monthKey(items[i - 1].at) !== monthKey(e.at);
                  return (
                    <li key={e.key} className="min-w-0">
                      {showMonth && (
                        <p className="qx-caption pb-1 pt-3 font-semibold uppercase tracking-wide text-fg-muted first:pt-0">
                          {formatDate(e.at, locale, { month: 'long', year: 'numeric' })}
                        </p>
                      )}
                      <Reveal index={i < 12 ? i : 0}>
                        <JourneyRow event={e} c={c} locale={locale} />
                      </Reveal>
                    </li>
                  );
                })}
              </ol>

              {query.hasNextPage ? (
                <button
                  type="button"
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                  aria-busy={query.isFetchingNextPage || undefined}
                  className={cn(SOFT_BUTTON, 'w-full disabled:opacity-70')}
                >
                  {query.isFetchingNextPage ? (
                    <>
                      <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
                      {c.loadingMore}
                    </>
                  ) : (
                    c.loadMore
                  )}
                </button>
              ) : (
                filter === 'all' && (
                  <p className="qx-caption flex items-center justify-center gap-2 py-2 text-center text-fg-muted">
                    <Flag aria-hidden className="size-3.5" />
                    {c.journeyStarted(formatDate(memberSince, locale, { day: 'numeric', month: 'long', year: 'numeric' }))}
                  </p>
                )
              )}
              {query.isFetchNextPageError && (
                <p role="alert" className="qx-small text-danger-text">
                  {c.sectionUnavailable}
                </p>
              )}
            </div>
          )}
        </QueryState>
      </div>
    </SectionCard>
  );
}

function JourneyRow({ event: e, c, locale }: { event: JourneyEvent; c: MeCopy['progress']; locale: MeLocale }) {
  const text = eventText(e, c, locale);
  const time = (
    <time dateTime={e.at} className="qx-caption text-fg-muted">
      {formatDate(e.at, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
    </time>
  );
  const marker =
    e.type === 'badge' ? (
      <BadgeGlyph
        label={e.data.name}
        imageSrc={e.data.imageSrc}
        emoji={e.data.emoji ?? undefined}
        rarity={e.data.rarity}
        color={e.data.color ?? undefined}
        size="sm"
        locale={locale}
        aria-hidden
      />
    ) : (
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full',
          e.type === 'heard' ? 'bg-success-subtle text-success-text' : 'bg-brand-subtle text-brand-text',
        )}
      >
        {ICON[e.type]}
      </span>
    );
  const body = (
    <>
      {marker}
      <span className="min-w-0 flex-1">
        <span className="qx-small block break-words text-fg">{text}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {time}
          {e.type === 'heard' && (
            <span className="qx-caption rounded-chip bg-success-subtle px-1.5 py-0.5 font-medium text-success-text">{c.events.heardTag}</span>
          )}
          {(e.type === 'review' || e.type === 'heard') && (
            <span className="qx-caption text-fg-muted">{e.data.source === 'qr' ? c.events.sourceQr : c.events.sourceConsumption}</span>
          )}
        </span>
      </span>
    </>
  );

  if (!e.href) {
    return <div className="flex min-h-11 items-start gap-3 rounded-control px-2 py-2">{body}</div>;
  }
  return (
    <Link
      href={e.href}
      className={cn(
        'flex min-h-11 items-start gap-3 rounded-control px-2 py-2 transition-colors duration-fast ease-standard hover:bg-surface-2',
        FOCUS_RING,
      )}
    >
      {body}
    </Link>
  );
}
