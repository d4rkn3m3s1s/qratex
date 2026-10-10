'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { Compass, Heart, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { GlowCard } from '@/components/ds/play';
import { EmptyState, QueryState } from '@/components/states';
import type { SavedResponse, SavedVenueDto } from '@/lib/places/types';
import { fetchSaved, placesKeys, venueHref, type Coords } from './api';
import { usePlacesCopy } from './copy';
import { formatDate, formatRelative } from './format';
import { usePlacesUrl } from './use-places-url';
import { BoostChip, SaveButton, VenueAvatar } from './venue-parts';
import { VenueCard, VenueListSkeleton } from './venue-card';

type SavedSort = 'recent' | 'near' | 'visits' | 'open';

function sortSaved(items: SavedVenueDto[], sort: SavedSort): SavedVenueDto[] {
  const list = [...items];
  if (sort === 'near') list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  else if (sort === 'visits') list.sort((a, b) => b.myVisits - a.myVisits || b.savedAt.localeCompare(a.savedAt));
  else if (sort === 'open') {
    const rank = (v: SavedVenueDto) => (v.openState?.status === 'open' ? 0 : v.openState ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b) || b.savedAt.localeCompare(a.savedAt));
  } else list.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return list;
}

export function SavedTab({
  coords,
  initial,
  onGoNearby,
}: {
  coords: Coords;
  initial: SavedResponse | null;
  onGoNearby: () => void;
}) {
  const { copy, locale } = usePlacesCopy();
  const url = usePlacesUrl();
  const raw = url.get('ssort');
  const sort: SavedSort = raw === 'near' && coords ? 'near' : raw === 'visits' || raw === 'open' ? raw : 'recent';

  const query = useQuery({
    queryKey: placesKeys.saved(coords),
    queryFn: ({ signal }) => fetchSaved(coords, signal),
    initialData: coords ? undefined : initial ?? undefined,
    placeholderData: coords && initial ? initial : undefined,
    staleTime: 30_000,
  });

  const items = useMemo(() => sortSaved(query.data?.items ?? [], sort), [query.data, sort]);
  const highlight = useMemo(() => (query.data?.items ?? []).find((v) => v.liveBoost) ?? null, [query.data]);

  const sortOptions = [
    { value: 'recent', label: copy.savedSortRecent },
    ...(coords ? [{ value: 'near', label: copy.savedSortNear }] : []),
    { value: 'visits', label: copy.savedSortVisits },
    { value: 'open', label: copy.savedSortOpen },
  ];

  return (
    <QueryState
      query={query}
      skeleton={<VenueListSkeleton count={3} />}
      isEmpty={(d) => d.items.length === 0}
      empty={
        <div className="flex flex-col gap-6">
          <EmptyState
            variant="first-use"
            icon={Heart}
            title={copy.savedEmptyTitle}
            description={copy.savedEmptyBody}
            action={
              <Button type="button" className="min-h-11" onClick={onGoNearby}>
                <Compass aria-hidden className="mr-2 h-4 w-4" />
                {copy.exploreNearby}
              </Button>
            }
          />
          {(query.data?.suggestions.length ?? 0) > 0 && (
            <section aria-labelledby="saved-suggestions" className="flex flex-col gap-3">
              <h2 id="saved-suggestions" className="qx-h3 text-fg">
                {copy.savedSuggestions}
              </h2>
              <ul className="flex flex-col gap-2">
                {query.data!.suggestions.map((s) => (
                  <li key={s.dealerId} className="flex items-center gap-3 rounded-card border border-subtle bg-surface-1 p-3">
                    <VenueAvatar name={s.name} src={s.image} size={44} />
                    <Link href={venueHref(s.dealerId)} prefetch={false} className="min-w-0 flex-1 rounded-chip text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="qx-body block truncate font-medium text-fg">{s.name}</span>
                      <span className="qx-caption block text-fg-muted">{copy.savedSuggestionVisited(formatRelative(s.lastVisitAt, locale))}</span>
                    </Link>
                    <SaveButton dealerId={s.dealerId} name={s.name} saved={false} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      }
    >
      {(data) => (
        <div className="flex flex-col gap-4">
          {highlight?.liveBoost && (
            <GlowCard register="play" accent="brand" className="flex items-center gap-3">
              <VenueAvatar name={highlight.name} src={highlight.image} size={48} />
              <div className="min-w-0 flex-1">
                <p className="qx-caption flex items-center gap-1 font-semibold text-brand">
                  <Zap aria-hidden className="h-3.5 w-3.5" />
                  {copy.savedNowTitle}
                </p>
                <p className="qx-body truncate font-semibold text-fg">{highlight.name}</p>
                <div className="mt-1">
                  <BoostChip boost={highlight.liveBoost} />
                </div>
              </div>
              <Button asChild variant="outline" className="min-h-11 shrink-0">
                <Link href={venueHref(highlight.dealerId)} prefetch={false}>
                  {copy.seeVenue}
                </Link>
              </Button>
            </GlowCard>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="qx-h3 text-fg" aria-live="polite">
              {copy.savedTitle(data.items.length)}
            </h2>
            <span className="qx-caption qx-num text-fg-muted">{copy.savedLimit(data.items.length, data.limit)}</span>
          </div>
          <ChoiceChips aria-label={copy.sort} size="sm" scroll options={sortOptions} value={sort} onChange={(v) => url.set({ ssort: v && v !== 'recent' ? v : null })} />
          <ul className="flex flex-col gap-3" aria-label={copy.tabs.saved}>
            <AnimatePresence initial={false}>
              {items.map((v, i) => (
                <VenueCard
                  key={v.dealerId}
                  venue={v}
                  index={i}
                  footer={<span className="qx-caption text-fg-subtle">{copy.savedSince(formatDate(v.savedAt, locale, { day: 'numeric', month: 'long', year: 'numeric' }))}</span>}
                />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </QueryState>
  );
}
