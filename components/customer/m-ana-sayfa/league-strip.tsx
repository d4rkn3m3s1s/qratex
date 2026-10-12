'use client';

import Link from 'next/link';
import { ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeagueEmblem } from '@/components/ds/play';
import { FOCUS_RING, formatInt } from '@/components/ds/play/shared';
import { EASE_CSS, DURATION_MS, useReducedMotionPref } from '@/lib/motion';
import { HOME_LINKS } from '@/lib/customer-home/core';
import type { HomeLeague } from '@/lib/customer-home/types';
import { useHomeCopy } from './copy';

/**
 * Lig şeridi: admin'in DB lig kuralları (tek kaynak), lig içi ilerleme, ligdeki sıra ve
 * bir üst sıraya fark — hepsi AYNI metrikle (puan bakiyesi). Karışık haftalık/tüm zamanlar
 * listesi ve "Siz (Sen)" satırı kaldırıldı.
 */
export function LeagueStrip({ league, showLeaderboardLink }: { league: HomeLeague; showLeaderboardLink: boolean }) {
  const { copy, locale } = useHomeCopy();
  const reduce = useReducedMotionPref();
  const isTop = league.rankInLeague === 1;

  return (
    <section
      id="home-league"
      aria-labelledby="home-league-title"
      className="scroll-mt-24 rounded-card border border-subtle bg-surface-1 p-4 qx-elevation-1 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <LeagueEmblem leagueKey={league.key} name={league.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="qx-overline text-fg-muted">{copy.leagueTitle}</p>
          <h2 id="home-league-title" className="qx-h3 truncate text-fg">
            {league.name}
          </h2>
        </div>
        {showLeaderboardLink ? (
          <Link
            href={HOME_LINKS.leaderboard}
            className={cn('inline-flex min-h-11 items-center gap-1 qx-small font-semibold text-brand', FOCUS_RING)}
          >
            {copy.leagueSee}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>

      <div className="mt-4">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={league.progress}
          aria-label={
            league.next && league.pointsToNext != null
              ? copy.leagueNext(league.next.name, formatInt(league.pointsToNext, locale))
              : copy.leagueMax
          }
          className="h-3 w-full overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${league.progress}%`,
              background: 'linear-gradient(90deg, hsl(var(--gradient-from)), hsl(var(--gradient-to)))',
              transition: reduce ? 'none' : `width ${DURATION_MS.slow}ms ${EASE_CSS.emphasized}`,
            }}
          />
        </div>
        <p className="mt-2 qx-small tabular-nums text-fg-muted">
          {league.next && league.pointsToNext != null
            ? copy.leagueNext(league.next.name, formatInt(league.pointsToNext, locale))
            : copy.leagueMax}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-0.5 border-t border-subtle pt-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <p className="qx-body font-semibold tabular-nums text-fg">
          {copy.leagueRank(formatInt(league.rankInLeague, locale), formatInt(league.leagueSize, locale))}
        </p>
        <p className={cn('qx-small tabular-nums', isTop ? 'font-medium text-success' : 'text-fg-muted')}>
          {isTop || league.gapToAbove == null ? copy.leagueTop : copy.leagueGap(formatInt(league.gapToAbove, locale))}
        </p>
      </div>

      {/* Basamaklar: bütün ligler, şu anki vurgulu (yatay kaydırılabilir). */}
      <ol tabIndex={0} className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={copy.leagueTitle}>
        {league.ladder.map((step) => {
          const current = step.key === league.key;
          return (
            <li
              key={step.key}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex min-w-[5.5rem] shrink-0 flex-col items-center gap-1 rounded-control border px-2 py-2 text-center',
                current ? 'border-brand-border bg-brand-subtle' : 'border-subtle bg-surface-2'
              )}
            >
              <LeagueEmblem leagueKey={step.key} name={step.name} size="sm" />
              <span className={cn('qx-caption truncate', current ? 'font-semibold text-fg' : 'text-fg-muted')}>{step.name}</span>
              <span className="qx-caption tabular-nums text-fg-subtle">{formatInt(step.minPoints, locale)}+</span>
              {current ? <span className="sr-only">({copy.leagueCurrent})</span> : null}
            </li>
          );
        })}
      </ol>

      <p className="mt-3 flex items-start gap-1.5 qx-caption text-fg-subtle">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {copy.leagueMetric}
      </p>
    </section>
  );
}
