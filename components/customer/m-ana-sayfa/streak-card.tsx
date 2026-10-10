'use client';

import { cn } from '@/lib/utils';
import { StreakFlame } from '@/components/ds/play';
import { formatInt } from '@/components/ds/play/shared';
import type { HomeStreak } from '@/lib/customer-home/types';
import { useHomeCopy } from './copy';

/**
 * Giriş serisi: alev + bu haftanın 7 günü (gerçek ardışık günlerden) + sıradaki ödüllü
 * kilometre taşı. Tek kaynak `User.loginStreak*` (eski "Aktif seri: 0" sabiti kaldırıldı).
 */
export function StreakCard({ streak, saving }: { streak: HomeStreak; saving: boolean }) {
  const { copy, locale } = useHomeCopy();

  const status = saving
    ? copy.goalSaving
    : streak.countedToday
      ? copy.streakKept
      : streak.days === 0
        ? copy.streakBroken
        : null;

  return (
    <section aria-labelledby="home-streak-title" className="rounded-card border border-subtle bg-surface-1 p-4 qx-elevation-1 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="home-streak-title" className="qx-h3 text-fg">
            {copy.streakTitle}
          </h2>
          <p className="mt-0.5 qx-small text-fg-muted">{copy.streakLongest(streak.longest)}</p>
        </div>
        <StreakFlame days={streak.days} size="lg" />
      </div>

      <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label={copy.streakTitle}>
        {streak.week.map((d, i) => (
          <li key={d.day} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                'grid size-9 place-items-center rounded-full border qx-caption font-semibold tabular-nums',
                d.active
                  ? 'border-warning-border bg-warning-subtle text-warning'
                  : d.isFuture
                    ? 'border-dashed border-subtle text-fg-subtle'
                    : 'border-subtle bg-surface-2 text-fg-subtle',
                d.isToday && 'ring-2 ring-brand ring-offset-2 ring-offset-background'
              )}
              aria-hidden
            >
              {d.day.slice(8, 10)}
            </span>
            <span className={cn('qx-caption', d.isToday ? 'font-semibold text-fg' : 'text-fg-muted')} aria-hidden>
              {copy.weekdays[i]}
            </span>
            <span className="sr-only">
              {copy.weekdaysLong[i]} {d.day}: {d.isFuture ? '—' : d.active ? copy.dayActive : copy.dayInactive}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-3 space-y-1">
        {status ? (
          <p className="qx-small text-fg-muted" role="status">
            {status}
          </p>
        ) : null}
        {streak.nextMilestone ? (
          <p className="qx-small font-medium text-fg">
            {copy.streakNext(
              streak.nextMilestone.days,
              formatInt(streak.nextMilestone.points, locale),
              streak.nextMilestone.daysLeft
            )}
          </p>
        ) : null}
      </div>
    </section>
  );
}
