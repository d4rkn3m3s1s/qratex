'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { List, Map as MapIcon, Search, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChoiceChips } from '@/components/ds/a11y';
import { EmptyState, QueryState, TONE_CALLOUT } from '@/components/states';
import { cn } from '@/lib/utils';
import { categoryLabel, isPlaceCategory, type PlaceCategory } from '@/lib/places/categories';
import { DEFAULT_RADIUS_KM, RADIUS_PRESETS_KM } from '@/lib/places/geo';
import type { NearbyResponse } from '@/lib/places/types';
import { fetchNearby, placesKeys, type Coords, type NearbyParams } from './api';
import { usePlacesCopy } from './copy';
import { formatClockIso, formatMultiplierLabel } from './format';
import { LocationPanel } from './location-panel';
import type { CoarseLocation, LocationStatus } from './use-coarse-location';
import { usePlacesUrl } from './use-places-url';
import { VenueCard, VenueListSkeleton } from './venue-card';

const PlacesMap = dynamic(() => import('./places-map'), {
  ssr: false,
  loading: () => <div className="h-[min(60dvh,28rem)] w-full rounded-card bg-surface-muted" aria-hidden />,
});

type Flag = 'open' | 'boost';

export function NearbyTab({
  status,
  location,
  locationReady,
  onRequestLocation,
  onForgetLocation,
  onOpenVenue,
}: {
  status: LocationStatus;
  location: CoarseLocation | null;
  /** Konum kararı verildi mi (ilk açılışta gereksiz "konumsuz" isteği atmamak için). */
  locationReady: boolean;
  onRequestLocation: () => void;
  onForgetLocation: () => void;
  onOpenVenue: (dealerId: string) => void;
}) {
  const { copy, locale } = usePlacesCopy();
  const url = usePlacesUrl();
  const coords: Coords = location ? { lat: location.lat, lng: location.lng } : null;

  const radiusRaw = Number(url.get('r'));
  const radius = (RADIUS_PRESETS_KM as readonly number[]).includes(radiusRaw) ? radiusRaw : DEFAULT_RADIUS_KM;
  const catRaw = url.get('cat');
  const category: PlaceCategory | null = isPlaceCategory(catRaw) ? catRaw : null;
  const flags: Flag[] = [url.get('open') === '1' ? 'open' : null, url.get('boost') === '1' ? 'boost' : null].filter(Boolean) as Flag[];
  const sort: 'distance' | 'rating' = url.get('sort') === 'rating' ? 'rating' : 'distance';
  const view: 'list' | 'map' = url.get('view') === 'map' && coords ? 'map' : 'list';
  const qUrl = url.get('q') ?? '';
  const [qInput, setQInput] = useState(qUrl);

  useEffect(() => {
    setQInput(qUrl);
  }, [qUrl]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (qInput.trim() !== qUrl) url.set({ q: qInput.trim() || null });
    }, 350);
    return () => window.clearTimeout(id);
  }, [qInput, qUrl, url]);

  const params: NearbyParams = useMemo(
    () => ({ coords, radius, category, q: qUrl.trim(), open: flags.includes('open'), boost: flags.includes('boost'), sort }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coords?.lat, coords?.lng, radius, category, qUrl, flags.join(','), sort],
  );

  const query = useInfiniteQuery({
    queryKey: placesKeys.nearby(params),
    queryFn: ({ pageParam, signal }) => fetchNearby(params, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last: NearbyResponse) => last.nextOffset ?? undefined,
    placeholderData: keepPreviousData,
    enabled: locationReady && !(status === 'locating' && !coords),
    staleTime: 60_000,
  });

  const first = query.data?.pages[0];
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const categoryOptions = useMemo(() => {
    const present = new Set<PlaceCategory>(first?.categories ?? []);
    if (category) present.add(category);
    return [
      { value: 'all', label: copy.allCategories },
      ...[...present].map((c) => ({ value: c, label: categoryLabel(c, locale) })),
    ];
  }, [first?.categories, category, copy.allCategories, locale]);

  const filtered = !!category || flags.length > 0 || !!qUrl;
  const clearFilters = () => url.set({ cat: null, open: null, boost: null, q: null });

  return (
    <div className="flex flex-col gap-4">
      <LocationPanel status={status} location={location} onRequest={onRequestLocation} onForget={onForgetLocation} />

      <div className="flex flex-col gap-3" role="search" aria-label={copy.searchLabel}>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="search"
            inputMode="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchLabel}
            maxLength={60}
            className="h-11 pl-9"
          />
        </div>
        {coords && (
          <ChoiceChips
            aria-label={copy.radius}
            size="sm"
            scroll
            options={RADIUS_PRESETS_KM.map((km) => ({ value: String(km), label: copy.radiusLabel(km) }))}
            value={String(radius)}
            onChange={(v) => url.set({ r: v && Number(v) !== DEFAULT_RADIUS_KM ? v : null })}
          />
        )}
        {categoryOptions.length > 1 && (
          <ChoiceChips
            aria-label={copy.category}
            size="sm"
            scroll
            options={categoryOptions}
            value={category ?? 'all'}
            onChange={(v) => url.set({ cat: v && v !== 'all' ? v : null })}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <ChoiceChips
            mode="multiple"
            aria-label={copy.quickFilters}
            size="sm"
            options={[
              { value: 'open' as Flag, label: copy.openNow },
              { value: 'boost' as Flag, label: copy.boostNow, icon: <Zap aria-hidden className="h-3.5 w-3.5" /> },
            ]}
            value={flags}
            onChange={(next) => url.set({ open: next.includes('open') ? '1' : null, boost: next.includes('boost') ? '1' : null })}
          />
          {coords && (
            <ChoiceChips
              aria-label={copy.sort}
              size="sm"
              options={[
                { value: 'distance', label: copy.sortDistance },
                { value: 'rating', label: copy.sortRating },
              ]}
              value={sort}
              onChange={(v) => url.set({ sort: v === 'rating' ? 'rating' : null })}
            />
          )}
          {coords && (
            <div className="ml-auto flex gap-1 rounded-control bg-surface-muted p-1" role="group" aria-label={copy.viewLabel}>
              {(['list', 'map'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => url.set({ view: v === 'map' ? 'map' : null })}
                  className={cn(
                    'qx-small inline-flex min-h-11 items-center gap-1.5 rounded-chip px-3 font-medium text-fg-muted transition-colors duration-fast sm:min-h-9',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    view === v && 'bg-surface-1 text-fg qx-elevation-1',
                  )}
                >
                  {v === 'map' ? <MapIcon aria-hidden className="h-4 w-4" /> : <List aria-hidden className="h-4 w-4" />}
                  {v === 'map' ? copy.viewMap : copy.viewList}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {first?.globalBoost && (
        <p className={cn('qx-small flex items-center gap-2 rounded-card border px-3 py-2 font-medium', TONE_CALLOUT.brand)}>
          <Zap aria-hidden className="h-4 w-4 shrink-0 text-brand" />
          {copy.globalBoost(formatMultiplierLabel(first.globalBoost.multiplier, locale), formatClockIso(first.globalBoost.endsAt, locale))}
        </p>
      )}

      {!coords && first?.mode === 'browse' && <p className="qx-caption text-fg-muted">{copy.browseHint}</p>}

      <QueryState
        query={{ ...query, data: query.data ?? null, isLoading: query.isLoading || (!locationReady && !query.data) }}
        skeleton={<VenueListSkeleton />}
        loadingLabel={copy.sheetLoading}
        isEmpty={(d) => (d.pages[0]?.items.length ?? 0) === 0}
        empty={
          <EmptyState
            variant={filtered ? 'filtered' : 'no-results'}
            title={copy.emptyNearbyTitle}
            description={copy.emptyNearbyBody}
            action={
              filtered ? (
                <Button type="button" variant="outline" className="min-h-11" onClick={clearFilters}>
                  {copy.clearFilters}
                </Button>
              ) : coords && radius < 25 ? (
                <Button type="button" variant="outline" className="min-h-11" onClick={() => url.set({ r: String(RADIUS_PRESETS_KM.find((k) => k > radius) ?? 25) })}>
                  {copy.widen}
                </Button>
              ) : undefined
            }
          />
        }
      >
        {() => (
          <div className="flex flex-col gap-3">
            <p className="qx-caption text-fg-muted" aria-live="polite">
              {copy.resultCount(first?.total ?? items.length)}
            </p>
            {view === 'map' && coords ? (
              <PlacesMap
                center={coords}
                venues={items}
                onSelect={onOpenVenue}
                labels={{ region: copy.mapLabel, you: copy.mapYou, select: copy.mapSelect }}
              />
            ) : (
              <ul className="flex flex-col gap-3" aria-label={copy.tabs.nearby}>
                {items.map((v, i) => (
                  <VenueCard key={v.dealerId} venue={v} index={i} />
                ))}
              </ul>
            )}
            {query.hasNextPage && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 self-center"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                aria-busy={query.isFetchingNextPage}
              >
                {copy.loadMore}
              </Button>
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}
