'use client';

import Link from 'next/link';
import { Gamepad2, History, ListChecks, QrCode, Target } from 'lucide-react';
import { RewardProgress } from '@/components/ds/play';
import { useNumberTicker } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useWalletCopy } from './copy';
import { formatPoints } from './format';

const EARN_LINKS = [
  { key: 'scan', href: '/customer/scan', icon: QrCode },
  { key: 'games', href: '/customer/games', icon: Gamepad2 },
  { key: 'quests', href: '/customer/quests', icon: ListChecks },
  { key: 'history', href: '/customer/wallet/activity', icon: History },
] as const;

/**
 * Bakiye + hedef kartı: "puanım neye yeter, sonraki ödüle ne kaldı, puan nereden gelir"
 * sorularının üçü tek bakışta. Bakiye sunucudan gelir; değişimde sayaçla akar (açılışta değil).
 */
export function BalanceHero({
  balance,
  goal,
  onOpenGoal,
}: {
  balance: number;
  goal: { id: string; name: string; cost: number } | null;
  onOpenGoal?: (id: string) => void;
}) {
  const copy = useWalletCopy();
  const shown = useNumberTicker(balance);
  return (
    <section
      aria-labelledby="wallet-balance-heading"
      className="rounded-card border border-subtle bg-surface-1 p-card qx-elevation-1"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="wallet-balance-heading" className="qx-overline text-fg-muted">
            {copy.balance}
          </h2>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="qx-display qx-num text-fg" aria-hidden>
              {formatPoints(shown, copy.locale)}
            </span>
            <span className="qx-small text-fg-muted" aria-hidden>
              {copy.pointsShort}
            </span>
            <span className="sr-only">{copy.points(formatPoints(balance, copy.locale))}</span>
          </p>
        </div>
        <nav aria-label={copy.earnTitle} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
          {EARN_LINKS.map(({ key, href, icon: Icon }) => (
            <Link
              key={key}
              href={href}
              className="qx-small inline-flex min-h-11 shrink-0 items-center gap-2 rounded-chip border border-subtle bg-surface-2 px-3 font-medium text-fg transition-colors duration-fast hover:border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon aria-hidden className="size-4 text-brand" />
              {copy.earn[key]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-4 border-t border-subtle pt-4">
        {goal ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <RewardProgress current={balance} target={goal.cost} rewardLabel={goal.name} className="min-w-0 flex-1" register="ops" />
            {onOpenGoal && (
              <button
                type="button"
                onClick={() => onOpenGoal(goal.id)}
                className={cn(
                  'qx-small inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control px-3 font-medium text-brand',
                  'hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                <Target aria-hidden className="size-4" />
                {copy.goalLabel(goal.name)}
              </button>
            )}
          </div>
        ) : (
          <p className="qx-small text-fg-muted">{copy.goalNone}</p>
        )}
      </div>
    </section>
  );
}
