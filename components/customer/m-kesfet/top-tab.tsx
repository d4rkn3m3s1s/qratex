'use client';

import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { m as Motion } from 'framer-motion';
import { Crown, Footprints, Info, Medal, QrCode, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { EmptyState, QueryState, TONE_CHIP } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { categoryLabel, isPlaceCategory, type PlaceCategory } from '@/lib/places/categories';
import type { TopEntryDto, TopResponse } from '@/lib/places/types';
import { fetchTop, placesKeys, venueHref } from './api';
import { usePlacesCopy } from './copy';
import { formatRating } from './format';
import { usePlacesUrl } from './use-places-url';
import { SaveButton, VenueAvatar } from './venue-parts';

export function TopTab({ initial }: { initial: TopResponse | null }) {
  const { copy, locale } = usePlacesCopy();
  const url = usePlacesUrl();
  const catRaw = url.get('category');
  const category: PlaceCategory | null = isPlaceCategory(catRaw) ? catRaw : null;
  const win: 30 | 90 = url.get('window') === '30' ? 30 : 90;
  const initialMatches = initial && initial.window === win && (initial.category ?? null) === category;

  const query = useQuery({
    queryKey: placesKeys.top(category, win),
    queryFn: ({ signal }) => fetchTop(category, win, signal),
    initialData: initialMatches ? initial ?? undefined : undefined,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });

  const data = query.data;
  const categoryOptions = [
    { value: 'all', label: copy.allCategories },
    ...(data?.categories ?? []).map((c) => ({ value: c.slug, label: `${categoryLabel(c.slug, locale)} (${c.rankedCount})`, textLabel: categoryLabel(c.slug, locale) })),
  ];
  const savedInList = data?.entries.filter((e) => e.isSaved).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {categoryOptions.length > 1 && (
          <ChoiceChips
            aria-label={copy.topCategoryLabel}
            size="sm"
            scroll
            options={categoryOptions}
            value={category ?? 'all'}
            onChange={(v) => url.set({ category: v && v !== 'all' ? v : null })}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <ChoiceChips
            aria-label={copy.topWindow}
            size="sm"
            options={[
              { value: '90', label: copy.topWindow90 },
              { value: '30', label: copy.topWindow30 },
            ]}
            value={String(win)}
            onChange={(v) => url.set({ window: v === '30' ? '30' : null })}
          />
        </div>
        <details className="group rounded-control border border-subtle bg-surface-1 px-3 py-2">
          <summary className="qx-small flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <Info aria-hidden className="h-4 w-4 text-brand" />
            {copy.topHow}
          </summary>
          <p className="qx-small pb-2 text-fg-muted">{copy.topHowBody(data?.meta.minReviewers ?? 3, data?.meta.priorWeight ?? 10)}</p>
        </details>
      </div>

      <QueryState
        query={query}
        skeleton="list"
        isEmpty={(d) => d.entries.length === 0}
        empty={
          <EmptyState
            variant="first-use"
            icon={Medal}
            title={copy.topEmptyTitle}
            description={copy.topEmptyBody}
            action={
              <Button asChild className="min-h-11">
                <Link href="/customer/scan">
                  <QrCode aria-hidden className="mr-2 h-4 w-4" />
                  {copy.topScan}
                </Link>
              </Button>
            }
          />
        }
      >
        {(d) => (
          <div className="flex flex-col gap-4">
            {savedInList > 0 && <p className="qx-caption text-fg-muted">{copy.topSavedInList(savedInList)}</p>}
            <Podium entries={d.entries.slice(0, 3)} />
            {d.entries.length > 3 && (
              <ol className="qx-fx-stagger flex flex-col gap-2" aria-label={copy.topTitle} start={4}>
                {d.entries.slice(3).map((e) => (
                  <TopRow key={e.dealerId} entry={e} />
                ))}
              </ol>
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}

/** Görsel sıra (CSS `order`): 2. solda, 1. ortada, 3. sağda; DOM sırası 1-2-3 (ekran okuyucu doğru okur). */
const PODIUM_VISUAL_ORDER = [1, 0, 2];
const PODIUM_HEIGHT = ['h-24', 'h-16', 'h-12'];
const MEDAL_TONE = ['warning', 'neutral', 'info'] as const;

function Podium({ entries }: { entries: TopEntryDto[] }) {
  const { copy, locale } = usePlacesCopy();
  const policy = useMotionPolicy();
  if (entries.length === 0) return null;
  return (
    <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4" aria-label={copy.topTitle}>
      {entries.map((e, idx) => {
        return (
          // Konum (sütun sırası) CSS'te; yükselme animasyonu içteki Motion'da.
          <li key={e.dealerId} className="flex min-w-0 flex-col items-center" style={{ order: PODIUM_VISUAL_ORDER[idx] }} value={idx + 1}>
            <Motion.div
              className="flex w-full min-w-0 flex-col items-center"
              initial={policy.reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.slow, ease: EASE.emphasized, delay: policy.reduce ? 0 : 0.08 * (2 - idx) }}
            >
              <div className="relative">
                <VenueAvatar name={e.name} src={e.image} size={idx === 0 ? 64 : 52} className={cn(idx === 0 && 'ring-2 ring-warning')} />
                {e.isBusinessOfMonth && (
                  <span className={cn('absolute -top-2 left-1/2 -translate-x-1/2 rounded-full p-1', TONE_CHIP.warning)} title={copy.topBom}>
                    <Crown aria-hidden className="h-3.5 w-3.5" />
                    <span className="sr-only">{copy.topBom}</span>
                  </span>
                )}
              </div>
              <Link
                href={venueHref(e.dealerId)}
                prefetch={false}
                className="qx-small mt-2 line-clamp-2 w-full break-words rounded-chip text-center font-semibold text-fg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="sr-only">{copy.rankLabel(e.rank)}: </span>
                {e.name}
              </Link>
              <span className="qx-caption mt-0.5 inline-flex items-center gap-1 text-fg-muted" aria-label={copy.ratingAria(formatRating(e.avgRating, locale), e.reviewers)}>
                <Star aria-hidden className="h-3 w-3 fill-current text-warning" />
                <span className="qx-num">{formatRating(e.avgRating, locale)}</span>
                <span className="qx-num">({e.reviewers})</span>
              </span>
              <SaveButton dealerId={e.dealerId} name={e.name} saved={e.isSaved} className="mt-1" />
              <div
                aria-hidden
                className={cn(
                  'mt-1 flex w-full items-start justify-center rounded-t-control pt-2',
                  PODIUM_HEIGHT[idx],
                  TONE_CHIP[MEDAL_TONE[idx]],
                )}
              >
                <span className="qx-h2 qx-num font-bold">{e.rank}</span>
              </div>
            </Motion.div>
          </li>
        );
      })}
    </ol>
  );
}

function TopRow({ entry }: { entry: TopEntryDto }) {
  const { copy, locale } = usePlacesCopy();
  const avg = formatRating(entry.avgRating, locale);
  return (
    <li value={entry.rank} className="relative flex items-center gap-3 rounded-card border border-subtle bg-surface-1 p-3 focus-within:ring-2 focus-within:ring-ring">
      <span className="qx-h3 qx-num w-8 shrink-0 text-center font-bold text-fg-muted" aria-hidden>
        {entry.rank}
      </span>
      <VenueAvatar name={entry.name} src={entry.image} size={44} />
      <div className="min-w-0 flex-1">
        <Link
          href={venueHref(entry.dealerId)}
          prefetch={false}
          className="qx-body block w-full truncate text-left font-semibold text-fg after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none"
        >
          <span className="sr-only">{copy.rankLabel(entry.rank)}: </span>
          {entry.name}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="qx-small inline-flex items-center gap-1 text-fg" aria-label={copy.ratingAria(avg, entry.reviewers)}>
            <Star aria-hidden className="h-3.5 w-3.5 fill-current text-warning" />
            <span className="qx-num font-semibold">{avg}</span>
            <span className="qx-num text-fg-muted">· {copy.reviews(entry.reviewers)}</span>
          </span>
          {entry.categories[0] && <span className="qx-caption text-fg-muted">{categoryLabel(entry.categories[0], locale)}</span>}
          {entry.visitedByMe && (
            <span className={cn('qx-caption inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5', TONE_CHIP.success)}>
              <Footprints aria-hidden className="h-3 w-3" />
              {copy.topVisited}
            </span>
          )}
          {entry.isBusinessOfMonth && (
            <span className={cn('qx-caption inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5', TONE_CHIP.warning)}>
              <Crown aria-hidden className="h-3 w-3" />
              {copy.topBom}
            </span>
          )}
        </div>
      </div>
      <SaveButton dealerId={entry.dealerId} name={entry.name} saved={entry.isSaved} />
    </li>
  );
}
