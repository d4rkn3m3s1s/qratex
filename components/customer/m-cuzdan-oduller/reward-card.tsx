'use client';

import { CalendarClock, CheckCircle2, Clock, Lock, PackageX, Sparkles, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RewardDTO, RewardState } from '@/lib/wallet-rewards/types';
import { useWalletCopy } from './copy';
import { endsSoon, formatDate, formatPoints, formatRelativeFuture } from './format';
import { RewardVisual } from './reward-visual';

const STATE_ICON: Record<RewardState, typeof Lock> = {
  available: CheckCircle2,
  insufficient: Lock,
  soldOut: PackageX,
  upcoming: CalendarClock,
  expired: Ban,
  limitReached: Ban,
};

const STATE_TONE: Record<RewardState, string> = {
  available: 'text-success',
  insufficient: 'text-fg-muted',
  soldOut: 'text-danger',
  upcoming: 'text-info',
  expired: 'text-fg-muted',
  limitReached: 'text-fg-muted',
};

/** Alınamaz durumlar soluk değil, ikon + metinle anlatılır (yalnız opaklığa dayanmaz). */
export function RewardCard({ reward, balance, onOpen }: { reward: RewardDTO; balance: number; onOpen: (id: string) => void }) {
  const copy = useWalletCopy();
  const Icon = STATE_ICON[reward.state];
  const missing = Math.max(0, reward.cost - balance);
  const pct = reward.cost > 0 ? Math.min(100, Math.floor((balance / reward.cost) * 100)) : 100;
  const blocked = reward.state === 'soldOut' || reward.state === 'expired';

  let chip: { text: string; icon: typeof Clock; tone: string } | null = null;
  if (reward.state === 'available' || reward.state === 'insufficient') {
    if (reward.stock.kind === 'low') chip = { text: copy.stockLow(reward.stock.left), icon: Clock, tone: 'bg-warning-subtle text-warning ring-warning-border' };
    else if (endsSoon(reward.validUntil)) chip = { text: copy.endsIn(formatRelativeFuture(reward.validUntil!, copy.locale)), icon: Clock, tone: 'bg-warning-subtle text-warning ring-warning-border' };
    else if (reward.isNew) chip = { text: copy.newBadge, icon: Sparkles, tone: 'bg-brand-subtle text-brand ring-brand-border' };
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(reward.id)}
      aria-haspopup="dialog"
      className={cn(
        'group flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-subtle bg-surface-1 text-left qx-elevation-1',
        'transition-[border-color,box-shadow] duration-fast ease-standard hover:border-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <div className="relative aspect-[4/3] w-full bg-surface-muted">
        <RewardVisual imageUrl={reward.imageUrl} glyph={reward.glyph} kind={reward.kind} className={cn(blocked && 'grayscale')} />
        <span className="qx-caption absolute left-2 top-2 rounded-chip bg-surface-1/90 px-2 py-0.5 font-medium text-fg ring-1 ring-inset ring-border">
          {copy.kind[reward.kind]}
        </span>
        {chip && (
          <span className={cn('qx-caption absolute right-2 top-2 inline-flex items-center gap-1 rounded-chip px-2 py-0.5 font-medium ring-1 ring-inset', chip.tone)}>
            <chip.icon aria-hidden className="size-3" />
            {chip.text}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
        <p className="qx-small line-clamp-2 font-semibold text-fg">{reward.name}</p>
        <p className="qx-body qx-num font-semibold text-fg">
          {formatPoints(reward.cost, copy.locale)} <span className="qx-caption font-normal text-fg-muted">{copy.pointsShort}</span>
        </p>
        <div className="mt-auto pt-1">
          {reward.state === 'insufficient' ? (
            <div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
              <p className="qx-caption mt-1 flex items-center gap-1 text-fg-muted">
                <Lock aria-hidden className="size-3 shrink-0" />
                {copy.missing(formatPoints(missing, copy.locale))}
              </p>
            </div>
          ) : (
            <p className={cn('qx-caption flex items-center gap-1 font-medium', STATE_TONE[reward.state])}>
              <Icon aria-hidden className="size-3.5 shrink-0" />
              {reward.state === 'upcoming' && reward.validFrom
                ? copy.startsAt(formatDate(reward.validFrom, copy.locale))
                : reward.state === 'limitReached' && reward.perUserLimit
                  ? copy.perUser(reward.userClaimCount, reward.perUserLimit)
                  : copy.state[reward.state]}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
