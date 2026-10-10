'use client';

import { m as Motion } from 'framer-motion';
import { Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountdownChip, GlowCard, PointsChip, StreakFlame } from '@/components/ds/play';
import { DURATION, EASE, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { formatCount, type QuestCopy } from './copy';
import type { QuestBoard } from './types';

const MAX_SEGMENTS = 8;

/** Günlük ilerleme: görev başına bir segment (Duolingo halkasının şerit hâli). */
function DailySegments({ done, total, label }: { done: number; total: number; label: string }) {
  const reduce = useReducedMotionPref();
  if (total <= 0) return null;
  const segments = Math.min(total, MAX_SEGMENTS);
  const filled = total <= MAX_SEGMENTS ? done : Math.round((done / total) * MAX_SEGMENTS);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="flex w-full gap-1.5"
    >
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <Motion.span
            className="block h-full rounded-full bg-success"
            initial={false}
            animate={{ width: i < filled ? '100%' : '0%' }}
            transition={reduce ? { duration: 0 } : { duration: DURATION.slow, ease: EASE.standard, delay: Math.min(i * 0.05, 0.3) }}
          />
        </span>
      ))}
    </div>
  );
}

export interface QuestHeroProps {
  board: QuestBoard;
  copy: QuestCopy;
  locale: 'tr' | 'en';
  claimingAll: boolean;
  claimDisabled: boolean;
  onClaimAll: () => void;
  onPeriodExpire: () => void;
}

/**
 * Tek hero şeridi (Bulgu 8): seri · bakiye (puan kapsülünün uçtuğu çip) · bekleyen ödül +
 * "Hepsini al" · bugünün görev ilerlemesi + gün sonu geri sayımı. Eski 4 kartlık tekrar eden
 * istatistik ızgarası kaldırıldı.
 */
export function QuestHero({ board, copy, locale, claimingAll, claimDisabled, onClaimAll, onPeriodExpire }: QuestHeroProps) {
  const { pending, groups } = board.summary;
  const daily = groups.daily;
  const streak = board.streak;
  const streakNote = streak.atRisk ? copy.streakAtRisk : streak.activeToday ? copy.streakSafe : copy.streakNone;

  return (
    <GlowCard accent={pending.count > 0 ? 'success' : 'brand'} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-3">
          <StreakFlame days={streak.current} size="lg" showLabel={false} locale={locale} />
          <div className="min-w-0">
            <p className="qx-overline text-fg-muted">{copy.streakLabel}</p>
            <p className="qx-h3 qx-num text-fg">
              {streak.current > 0 ? (locale === 'en' ? `${streak.current} ${streak.current === 1 ? 'day' : 'days'}` : `${streak.current} gün`) : '—'}
            </p>
            <p className={cn('qx-caption', streak.atRisk ? 'font-medium text-warning' : 'text-fg-muted')}>{streakNote}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
          <PointsChip value={board.balance} momentAnchor announce size="md" locale={locale} />
          {pending.count > 0 ? (
            <p className="qx-small text-fg">
              {copy.pendingTitle}:{' '}
              <span className="qx-num font-semibold text-success">+{formatCount(pending.points, locale)}</span>
              {pending.xp > 0 ? <span className="qx-num text-fg-muted"> · +{formatCount(pending.xp, locale)} XP</span> : null}
            </p>
          ) : (
            <p className="qx-caption text-fg-muted">{copy.pendingNone}</p>
          )}
        </div>
      </div>

      {pending.count > 0 ? (
        <Button
          type="button"
          onClick={onClaimAll}
          disabled={claimDisabled}
          aria-busy={claimingAll || undefined}
          className="min-h-12 w-full bg-success text-success-fg shadow-none hover:bg-success/90"
        >
          {claimingAll ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Gift className="h-4 w-4" aria-hidden />}
          {claimingAll ? copy.claiming : copy.claimAll(pending.count)}
        </Button>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="qx-small font-medium text-fg">
            {daily.total > 0 ? copy.heroDaily(daily.done, daily.total) : copy.heroNoDaily}
          </p>
          <CountdownChip mode="day" size="sm" label={copy.dayEnds} onExpire={onPeriodExpire} locale={locale} />
        </div>
        <DailySegments done={daily.done} total={daily.total} label={copy.heroDaily(daily.done, daily.total)} />
      </div>
    </GlowCard>
  );
}
