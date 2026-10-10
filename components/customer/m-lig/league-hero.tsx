'use client';

import Link from 'next/link';
import { ArrowDown, ArrowUp, EyeOff, LocateFixed, Target, TrendingUp } from 'lucide-react';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { GlowCard, LeagueEmblem, CountdownChip } from '@/components/ds/play';
import { Button } from '@/components/ui/button';
import { popIn, useNumberTicker } from '@/lib/motion';
import type { LeagueBoardDTO } from '@/lib/league-board/types';
import { cn } from '@/lib/utils';
import { useLigCopy } from './use-lig-copy';

/**
 * "Senin haftan" kahramanı: lig amblemi + ad, bir üst lige kalan puan, büyük sıra rakamı
 * (değişimde sayar), son ziyaretten beri değişim, bir sonraki somut hedef ve dönem sayacı.
 * Bütün sayılar sunucunun `me` nesnesinden gelir (oturumdaki bayat puan kullanılmaz).
 */
export function LeagueHero({
  board,
  rankDelta,
  onGoToMe,
  onPeriodExpire,
}: {
  board: LeagueBoardDTO;
  /** Son ziyaretten beri sıra değişimi (+ yükseldi); bilinmiyorsa null. */
  rankDelta: number | null;
  onGoToMe: () => void;
  onPeriodExpire: () => void;
}) {
  const { copy, fmt } = useLigCopy();
  const { me, category, period } = board;
  const cat = copy.category[category];
  const animatedRank = useNumberTicker(me.rank ?? 0);
  const shownRank = me.rank ? Math.max(1, Math.round(animatedRank)) : null;

  const nextTarget =
    me.rank === 1
      ? { icon: TrendingUp, text: copy.atTop }
      : me.gapToNext != null && me.rank
        ? { icon: Target, text: copy.gapToNext(fmt(me.gapToNext), cat.unit, me.rank - 1) }
        : null;

  return (
    <GlowCard className="p-4 sm:p-6" aria-labelledby="lig-hero-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        {/* Lig kimliği */}
        <div className="flex min-w-0 items-center gap-4">
          <LeagueEmblem leagueKey={me.league.key} name={me.league.name} size="lg" />
          <div className="min-w-0">
            <p className="qx-caption font-medium uppercase tracking-wide text-fg-muted">{copy.yourLeague}</p>
            <h2 id="lig-hero-title" className="qx-h2 font-display text-fg">
              {copy.leagueName(me.league.name)}
            </h2>
            <p className="qx-small text-fg-muted">
              {copy.level(me.level)} · {copy.balance(fmt(me.points))}
            </p>
          </div>
        </div>

        {/* Sıra */}
        <div className="flex items-end gap-3 sm:flex-col sm:items-end sm:gap-1">
          {me.rank ? (
            <p className="flex items-baseline gap-2" aria-label={copy.rankAria(me.rank, board.total)}>
              <span aria-hidden className="qx-display font-display tabular-nums text-fg">
                #{fmt(shownRank ?? me.rank)}
              </span>
              <span aria-hidden className="qx-small text-fg-muted">
                {copy.ofPlayers(fmt(board.total), board.truncated)}
              </span>
            </p>
          ) : me.rankFloor ? (
            <p className="qx-h2 font-display tabular-nums text-fg">#{copy.rankFloor(fmt(me.rankFloor - 1))}</p>
          ) : (
            <p className="qx-h3 font-semibold text-fg">{copy.notRanked}</p>
          )}
          <AnimatePresence initial={false}>
            {rankDelta ? (
              <Motion.span
                key={rankDelta}
                variants={popIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={cn(
                  'qx-caption inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ring-1 ring-inset',
                  rankDelta > 0
                    ? 'bg-success-subtle text-success ring-success-border'
                    : 'bg-warning-subtle text-warning ring-warning-border'
                )}
              >
                {rankDelta > 0 ? <ArrowUp aria-hidden className="size-3.5" /> : <ArrowDown aria-hidden className="size-3.5" />}
                {rankDelta > 0 ? copy.sinceLastVisitUp(rankDelta) : copy.sinceLastVisitDown(-rankDelta)}
              </Motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Sonraki hedef + lig ilerlemesi */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          {me.rank ? (
            <>
              {nextTarget ? (
                <p className="qx-body flex items-start gap-2 font-medium text-fg">
                  <nextTarget.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>{nextTarget.text}</span>
                </p>
              ) : null}
              {me.gapToTop10 != null ? (
                <p className="qx-small text-fg-muted">{copy.gapToTop10(fmt(me.gapToTop10), cat.unit)}</p>
              ) : null}
              <p className="qx-small text-fg-muted">
                {copy.category[category].label}: <span className="font-semibold tabular-nums text-fg">{fmt(me.score)}</span> {cat.unit}
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <p className="qx-small text-fg-muted">{copy.notRankedHint(cat.unit)}</p>
              <Button asChild size="sm" className="min-h-11">
                <Link href={cat.ctaHref} prefetch={false}>
                  {cat.ctaLabel}
                </Link>
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="qx-small font-medium text-fg">
              {me.nextLeague ? copy.toNextLeague(fmt(me.nextLeague.pointsNeeded), me.nextLeague.name) : copy.topLeague}
            </p>
            {me.nextLeague ? <LeagueEmblem leagueKey={me.nextLeague.key} name={me.nextLeague.name} size="sm" /> : null}
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={me.leagueProgress}
            aria-label={me.nextLeague ? copy.toNextLeague(fmt(me.nextLeague.pointsNeeded), me.nextLeague.name) : copy.topLeague}
            className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--gradient-from))] to-[hsl(var(--gradient-to))] transition-[width] duration-slow ease-standard"
              style={{ width: `${me.leagueProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Alt şerit: sayaç, gizli mod, sırama git */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {period === 'week' ? (
          <CountdownChip mode="week" label={copy.weekEndsIn} size="sm" onExpire={onPeriodExpire} />
        ) : period === 'season' && board.window.endsAt ? (
          <CountdownChip target={board.window.endsAt} label={copy.seasonEndsIn} size="sm" onExpire={onPeriodExpire} />
        ) : null}
        {!me.visibleToOthers ? (
          <span className="qx-caption inline-flex h-7 items-center gap-1 rounded-full bg-surface-3 px-2 font-medium text-fg-muted ring-1 ring-inset ring-border">
            <EyeOff aria-hidden className="size-3.5" />
            {copy.hiddenModeBanner}
          </span>
        ) : null}
        {me.rank && me.rank > 3 ? (
          <Button type="button" variant="ghost" size="sm" className="ml-auto min-h-11" onClick={onGoToMe}>
            <LocateFixed aria-hidden className="mr-1.5 size-4" />
            {copy.goToMe}
          </Button>
        ) : null}
      </div>
    </GlowCard>
  );
}
