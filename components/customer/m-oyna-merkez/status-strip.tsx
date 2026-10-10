import type { ReactNode } from 'react';
import { CalendarClock, Coins, Flame } from 'lucide-react';
import { CountdownChip, StreakFlame } from '@/components/ds/play';
import { cn } from '@/lib/utils';
import type { EarningsData, Settled, TodayData } from '@/lib/play-hub/server';
import { streakBonusXp, type StreakSummary } from '@/lib/play-hub/catalog';
import { playHubCopy, type PlayLocale } from './copy';
import { SectionError } from './section-error';

function Tile({ title, icon, children, className }: { title: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section
      aria-label={title}
      className={cn('flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface-1 p-4 qx-elevation-1', className)}
    >
      <h2 className="flex items-center gap-2 qx-small font-semibold text-fg-muted">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Yatay ilerleme çubuğu (role=progressbar; yalnız renge dayanmaz — yanında sayı var). */
export function Meter({
  value,
  max,
  label,
  tone = 'brand',
  className,
}: {
  value: number;
  max: number;
  label: string;
  tone?: 'brand' | 'success' | 'warning';
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-slow ease-standard',
          tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-brand'
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Lobinin üst şeridi: oyun serisi · bugünkü denemeler (+ yenilenme sayacı) · bugünkü oyun
 * puanı / tavan. Her kutu kendi verisine bağlıdır; biri düşerse yalnız o kutu hata gösterir.
 */
export function StatusStrip({
  locale,
  streak,
  today,
  earnings,
  totalGames,
}: {
  locale: PlayLocale;
  streak: Settled<StreakSummary>;
  today: Settled<TodayData>;
  earnings: Settled<EarningsData>;
  totalGames: number;
}) {
  const c = playHubCopy(locale);
  const used = today.ok ? [...today.data.entries.keys()].length : 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile title={c.streakTitle} icon={<Flame className="size-4 text-warning" aria-hidden />}>
        {streak.ok ? (
          <>
            <StreakFlame days={streak.data.current} size="lg" locale={locale} className="text-fg" />
            <p className={cn('qx-small', streak.data.atRisk ? 'text-warning' : 'text-fg-muted')}>
              {streak.data.wonToday
                ? c.streakSafe(streak.data.current)
                : streak.data.atRisk
                  ? c.streakAtRisk(streak.data.current)
                  : c.streakNone}
            </p>
            {!streak.data.wonToday && (
              <p className="qx-caption text-fg-muted">
                {c.streakNext(streak.data.nextLength, streakBonusXp(streak.data.nextLength))}
              </p>
            )}
            <p className="qx-caption text-fg-muted">
              {c.streakMilestone(streak.data.nextMilestone)} · {c.streakLongest(streak.data.longest)}
            </p>
          </>
        ) : (
          <SectionError locale={locale} kind={streak.error} className="p-0" />
        )}
      </Tile>

      <Tile title={c.attemptsTitle} icon={<CalendarClock className="size-4 text-brand" aria-hidden />}>
        {today.ok ? (
          <>
            <p className="qx-h3 font-display qx-num text-fg">{c.attemptsValue(Math.min(used, totalGames), totalGames)}</p>
            <Meter value={Math.min(used, totalGames)} max={Math.max(totalGames, 1)} label={c.attemptsTitle} />
            <div className="flex flex-wrap items-center gap-2">
              <CountdownChip target={today.data.resetAt} label={c.resetIn} size="sm" locale={locale} />
            </div>
            <p className="qx-caption text-fg-muted">{c.attemptsHint}</p>
          </>
        ) : (
          <SectionError locale={locale} kind={today.error} className="p-0" />
        )}
      </Tile>

      <Tile title={c.earningsTitle} icon={<Coins className="size-4 text-warning" aria-hidden />}>
        {earnings.ok ? (
          <>
            <p className="qx-h3 font-display qx-num text-fg">{c.earningsValue(earnings.data.today, earnings.data.dailyCap)}</p>
            <Meter
              value={earnings.data.today}
              max={earnings.data.dailyCap}
              label={c.earningsTitle}
              tone={earnings.data.today >= earnings.data.dailyCap ? 'warning' : 'success'}
            />
            {earnings.data.today >= earnings.data.dailyCap ? (
              <p className="qx-small text-warning">{c.earningsCapped}</p>
            ) : null}
            <p className="qx-caption text-fg-muted">{c.earningsHint(earnings.data.week, earnings.data.weeklyCap)}</p>
          </>
        ) : (
          <SectionError locale={locale} kind={earnings.error} className="p-0" />
        )}
      </Tile>
    </div>
  );
}
