'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { ChevronRight, History, Navigation, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DURATION, EASE, listItem, useMotionPolicy } from '@/lib/motion';
import { directionsLinks } from '@/lib/places/geo';
import type { VenueSummaryDto } from '@/lib/places/types';
import { venueHref } from './api';
import { usePlacesCopy } from './copy';
import { BoostChip, CategoryLine, DistanceInline, FlashChip, OpenStateBadge, RatingInline, SaveButton, VenueAvatar } from './venue-parts';

/**
 * Mekân kartı — kartın tamamı mekân detayına gider (`/customer/places/[dealerId]`; gerilmiş
 * bağlantı deseni: tek sekme durağı, ekran okuyucuda tek ad); kalp ayrı, üstte ve kendi adıyla. Durum yalnız renkle değil, ikon +
 * metinle anlatılır.
 */
export function VenueCard({
  venue,
  index,
  footer,
  headingLevel = 'h3',
}: {
  venue: VenueSummaryDto;
  index: number;
  footer?: ReactNode;
  headingLevel?: 'h2' | 'h3';
}) {
  const { copy } = usePlacesCopy();
  const policy = useMotionPolicy();
  const Heading = headingLevel;
  return (
    // Çıkışta yükseklik çöker (kalan kartlar zıplamaz); `layout` (domMax) gerekmez. Dolgu, odak halkası kırpılmasın diye.
    <Motion.li
      variants={listItem}
      custom={index}
      initial="hidden"
      animate="visible"
      exit={policy.reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0, transition: { duration: DURATION.base, ease: EASE.exit } }}
      className="-m-0.5 list-none overflow-hidden p-0.5"
    >
      <article className="group relative flex gap-3 rounded-card border border-subtle bg-surface-1 p-3 transition-colors duration-fast ease-standard focus-within:ring-2 focus-within:ring-ring hover:border-strong sm:p-4">
        <VenueAvatar name={venue.name} src={venue.image} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <Heading className="qx-body min-w-0 flex-1 font-semibold text-fg">
              <Link
                href={venueHref(venue.dealerId)}
                prefetch={false}
                className="block w-full text-left after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none"
              >
                <span className="line-clamp-2 break-words">{venue.name}</span>
              </Link>
            </Heading>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <OpenStateBadge state={venue.openState} />
            <RatingInline rating={venue.rating} />
            <DistanceInline km={venue.distanceKm} />
          </div>
          <CategoryLine categories={venue.categories} />
          {venue.address && <span className="qx-caption line-clamp-1 break-words text-fg-subtle">{venue.address}</span>}
          {(venue.liveBoost || venue.flashCount > 0 || venue.myVisits > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {venue.liveBoost && <BoostChip boost={venue.liveBoost} />}
              <FlashChip count={venue.flashCount} />
              {venue.myVisits > 0 && (
                <span className="qx-caption inline-flex items-center gap-1 text-fg-muted">
                  <History aria-hidden className="h-3.5 w-3.5" />
                  {copy.visits(venue.myVisits)}
                </span>
              )}
            </div>
          )}
          {footer}
          <VenueQuickActions venue={venue} />
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between">
          <SaveButton dealerId={venue.dealerId} name={venue.name} saved={venue.isSaved} />
          <ChevronRight aria-hidden className={cn('h-4 w-4 text-fg-subtle transition-transform duration-fast group-hover:translate-x-0.5')} />
        </div>
      </article>
    </Motion.li>
  );
}

export function VenueListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex gap-3 rounded-card border border-subtle bg-surface-1 p-3 sm:p-4">
          <span className="h-14 w-14 shrink-0 rounded-control bg-surface-muted" />
          <span className="flex flex-1 flex-col gap-2 pt-1">
            <span className="h-4 w-1/2 rounded bg-surface-muted" />
            <span className="h-3 w-3/4 rounded bg-surface-muted" />
            <span className="h-3 w-1/3 rounded bg-surface-muted" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Yol tarifi (koordinatla, adres metniyle değil) + ara — kartın gerilmiş bağlantısının üstünde. */
function VenueQuickActions({ venue }: { venue: VenueSummaryDto }) {
  const { copy } = usePlacesCopy();
  const links = venue.latitude != null && venue.longitude != null ? directionsLinks(venue.latitude, venue.longitude) : null;
  if (!links && !venue.phone) return null;
  const cls =
    'qx-small relative z-raised inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 font-medium text-brand hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9';
  return (
    <div className="-ml-2 flex flex-wrap items-center gap-1">
      {links && (
        <a href={links.google} target="_blank" rel="noopener noreferrer" className={cls} aria-label={`${copy.directions}: ${venue.name}`}>
          <Navigation aria-hidden className="h-4 w-4" />
          {copy.directions}
        </a>
      )}
      {venue.phone && (
        <a href={`tel:${venue.phone.replace(/[^\d+]/g, '')}`} className={cls} aria-label={`${copy.call}: ${venue.name}`}>
          <Phone aria-hidden className="h-4 w-4" />
          {copy.call}
        </a>
      )}
    </div>
  );
}
