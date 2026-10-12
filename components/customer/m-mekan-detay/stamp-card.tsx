'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ScanLine, Stamp } from 'lucide-react';
import { m as Motion } from 'framer-motion';
import { GlowCard } from '@/components/ds/play';
import { announce } from '@/components/ds/a11y';
import { Button } from '@/components/ui/button';
import { DURATION, EASE, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { VenueDetail } from '@/lib/venue-detail/types';
import { getVenueCopy, type VenueLocale } from './copy';

const SEEN_KEY = (dealerId: string) => `qx-venue-stamps-seen:${dealerId}`;

/** Yeni damgaları yalnız bir kez canlandırmak için bu tarayıcıda görülen son sayı. */
function readSeen(dealerId: string): number | null {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY(dealerId));
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeSeen(dealerId: string, days: number) {
  try {
    window.localStorage.setItem(SEEN_KEY(dealerId), String(days));
  } catch {
    /* gizli pencere / engelli depolama — yalnız animasyon atlanır */
  }
}

/**
 * Ziyaret kartı — her farklı ziyaret günü bir damga (sunucu hesaplar, lib/venue-detail/visits).
 * Yeni kazanılan damga(lar) bu tarayıcıda ilk görüldüğünde bir kez "basılır"; azaltılmış
 * harekette statik. Ödül vaadi yoktur (dürüst etiket).
 */
export function StampCard({
  dealerId,
  visits,
  locale,
}: {
  dealerId: string;
  visits: VenueDetail['visits'];
  locale: VenueLocale;
}) {
  const copy = getVenueCopy(locale);
  const reduce = useReducedMotionPref();
  const { stamps, tier, days } = visits;
  const [freshFrom, setFreshFrom] = useState<number | null>(null);

  useEffect(() => {
    const seen = readSeen(dealerId);
    if (seen != null && days > seen) {
      const newCount = days - seen;
      // Güncel kartta yeni basılan hücreler: (filled - newCount, filled]
      setFreshFrom(Math.max(0, stamps.filled - newCount));
      announce(copy.newStampAnnounce(newCount));
    }
    writeSeen(dealerId, days);
    // yalnız ilk görünümde
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerId, days]);

  const cells = Array.from({ length: stamps.perCard }, (_, i) => i + 1);
  const nextLabel = tier.next ? copy.tiers[tier.next] : null;

  return (
    <GlowCard register="play" accent="brand" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="qx-h3 flex items-center gap-2 text-fg">
            <Stamp aria-hidden className="h-5 w-5 text-brand" />
            {copy.stampsTitle}
          </h2>
          <p className="qx-small mt-0.5 text-fg-muted">{copy.stampsDesc}</p>
        </div>
        {tier.current && (
          <p className="rounded-full border border-brand-border bg-brand-subtle px-3 py-1 text-sm font-medium text-brand">
            <span className="sr-only">{copy.tierLabel}: </span>
            {copy.tiers[tier.current]}
          </p>
        )}
      </div>

      <ol aria-label={copy.stampsListAria} className="mt-4 grid grid-cols-5 gap-2 sm:gap-3">
        {cells.map((i) => {
          const filled = i <= stamps.filled;
          const fresh = filled && freshFrom != null && i > freshFrom && !reduce;
          return (
            <li key={i} className="relative aspect-square min-w-0">
              <span className="sr-only">{copy.stampAria(i, filled)}</span>
              <div
                aria-hidden
                className={cn(
                  'grid h-full w-full place-items-center rounded-full border-2 border-dashed border-border',
                  filled && 'border-transparent'
                )}
              >
                {!filled && <span className="qx-caption tabular-nums text-fg-subtle">{i}</span>}
              </div>
              {filled && (
                <Motion.div
                  aria-hidden
                  className="absolute inset-0 grid place-items-center rounded-full bg-brand text-brand-fg"
                  initial={fresh ? { scale: 1.6, opacity: 0, rotate: -18 } : false}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{
                    duration: DURATION.slow,
                    ease: EASE.emphasized,
                    delay: fresh && freshFrom != null ? Math.min(0.6, (i - freshFrom - 1) * 0.12) : 0,
                  }}
                >
                  <Check className="h-1/2 w-1/2" strokeWidth={3} />
                </Motion.div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold tabular-nums text-fg">{copy.stampsCount(stamps.filled, stamps.perCard)}</p>
        {stamps.completedCards > 0 && (
          <p className="qx-small text-fg-muted">{copy.stampsCompleted(stamps.completedCards)}</p>
        )}
      </div>
      {days > 0 ? (
        <>
          <p className="qx-small mt-1 text-fg-muted">{copy.stampsToFull(stamps.toFull)}</p>
          <p className="qx-small mt-1 text-fg-muted">
            {nextLabel && tier.nextAt ? copy.tierNext(nextLabel, tier.nextAt) : copy.tierMax}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            <div className="min-w-0">
              <dt className="qx-caption text-fg-muted">{copy.visitDays}</dt>
              <dd className="qx-num mt-0.5 text-lg font-semibold text-fg">{days}</dd>
            </div>
            <div className="min-w-0">
              <dt className="qx-caption text-fg-muted">{copy.firstVisit}</dt>
              <dd className="mt-0.5 text-sm font-medium text-fg">
                {visits.firstVisitAt ? copy.date(new Date(visits.firstVisitAt)) : '—'}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="qx-caption text-fg-muted">{copy.lastVisit}</dt>
              <dd className="mt-0.5 text-sm font-medium text-fg">
                {visits.lastVisitAt ? copy.date(new Date(visits.lastVisitAt)) : '—'}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <div className="mt-3 flex flex-col gap-3 rounded-control border border-dashed border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-fg">{copy.noVisitsTitle}</p>
            <p className="qx-small text-fg-muted">{copy.noVisitsBody}</p>
          </div>
          <Button asChild className="shrink-0 gap-2">
            <Link href="/customer/scan">
              <ScanLine aria-hidden className="h-4 w-4" />
              {copy.scanCta}
            </Link>
          </Button>
        </div>
      )}
    </GlowCard>
  );
}
