'use client';

/**
 * Hikâyeyi atlayan / tekrar bakan için özet ızgarası. Her kart tek metrik + bağlam ve
 * ilgili sayfaya derin bağlantı (denetim #26). Sıfır olan ikincil metrikler gizlenir
 * (ziyaret ve yorum her zaman görünür). İkonlar metrik başına tek ve `aria-hidden`.
 */
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { Award, CalendarCheck, MessageSquare, MessagesSquare, Shield, Star, Store, Swords, Zap, ChevronRight } from 'lucide-react';
import { DeltaBadge } from '@/components/ds/data/delta-badge';
import { LeagueEmblem } from '@/components/ds/play';
import { cn } from '@/lib/utils';
import type { YearSummary } from '@/lib/customer-year/contract';
import type { YearCopy } from './copy';

type Tile = {
  key: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  delta?: { value: number; label: string };
  accent?: boolean;
};

function TileCard({ t }: { t: Tile }) {
  const Icon = t.icon;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 qx-small font-medium text-muted-foreground">
          <Icon className={cn('size-4', t.accent ? 'text-brand' : 'text-muted-foreground')} aria-hidden="true" />
          {t.label}
        </span>
        {t.href ? <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
      </div>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums text-foreground">{t.value}</p>
      {t.hint ? <p className="mt-1 qx-small text-muted-foreground">{t.hint}</p> : null}
      {t.delta ? (
        <DeltaBadge className="mt-2" delta={{ value: t.delta.value, kind: 'absolute', goodDirection: 'up' }} label={t.delta.label} />
      ) : null}
    </>
  );
  const base =
    'block h-full rounded-2xl border border-border bg-card p-4 text-left transition-[box-shadow,transform,border-color] duration-fast ease-standard';
  return t.href ? (
    <Link
      href={t.href}
      className={cn(
        base,
        'hover:-translate-y-0.5 hover:border-brand-border hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

export function SummaryGrid({ summary, copy }: { summary: YearSummary; copy: YearCopy }) {
  const s = summary;
  const prevLabel = copy.vsPrevious(copy.periodLabel(s.previous.year, s.previous.month));
  const tiles: Tile[] = [
    {
      key: 'visits',
      icon: Store,
      label: copy.stat.visits,
      value: copy.fmt(s.visits.total),
      hint: copy.statHint.visits(s.visits.places),
      href: '/customer/wallet/activity',
      delta: s.visits.total + s.visits.previousTotal > 0 ? { value: s.visits.total - s.visits.previousTotal, label: prevLabel } : undefined,
      accent: true,
    },
    {
      key: 'reviews',
      icon: MessageSquare,
      label: copy.stat.reviews,
      value: copy.fmt(s.reviews.total),
      hint: copy.statHint.reviews(s.reviews.average),
      href: '/customer/me/voices',
      delta: s.reviews.total + s.reviews.previousTotal > 0 ? { value: s.reviews.total - s.reviews.previousTotal, label: prevLabel } : undefined,
      accent: true,
    },
  ];
  if (s.reviews.mostGiven != null) {
    tiles.push({ key: 'most', icon: Star, label: copy.stat.mostGiven, value: `${s.reviews.mostGiven}★` });
  }
  if (s.impact.respondingDealers > 0) {
    tiles.push({
      key: 'replies',
      icon: MessagesSquare,
      label: copy.stat.replies,
      value: copy.fmt(s.impact.respondingDealers),
      hint: copy.statHint.replies(s.impact.replyRate),
      href: '/customer/me/voices',
    });
  }
  if (s.visits.activeDays > 0) {
    tiles.push({
      key: 'days',
      icon: CalendarCheck,
      label: copy.stat.activeDays,
      value: copy.fmt(s.visits.activeDays),
      hint: s.visits.longestStreak >= 2 ? `${copy.stat.streak}: ${copy.daysUnit(s.visits.longestStreak)}` : undefined,
    });
  }
  if (s.badges.total > 0) {
    tiles.push({ key: 'badges', icon: Award, label: copy.stat.badges, value: copy.fmt(s.badges.total), href: '/customer/me/badges' });
  }
  if (s.points.earned > 0) {
    tiles.push({
      key: 'points',
      icon: Zap,
      label: copy.stat.points,
      value: copy.fmt(s.points.earned),
      hint: copy.statHint.points,
      href: '/customer/wallet/activity',
    });
  }
  const league = s.journey.endLeague ?? s.journey.peakLeague;
  if (league) {
    tiles.push({
      key: 'league',
      icon: Shield,
      label: copy.stat.league,
      value: (
        <span className="inline-flex items-center gap-2">
          <LeagueEmblem leagueKey={league.key} name={league.name} size="sm" />
          <span className="text-2xl">{league.name}</span>
        </span>
      ),
      hint: s.journey.levelTo != null ? copy.story.journey.level(s.journey.levelFrom, s.journey.levelTo) : undefined,
      href: '/customer/leaderboard',
    });
  }
  if (s.squads.battles > 0) {
    tiles.push({
      key: 'squads',
      icon: Swords,
      label: copy.stat.squads,
      value: copy.fmt(s.squads.battles),
      hint: copy.statHint.squads(s.squads.wins),
      href: '/customer/squads',
    });
  }

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <li key={t.key}>
          <TileCard t={t} />
        </li>
      ))}
    </ul>
  );
}
