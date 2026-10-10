'use client';

import { Check, Gift, Lock, Loader2, Trophy } from 'lucide-react';
import { m as Motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { DURATION, SPRING, useMotionPolicy, EASE_CSS, DURATION_MS } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { InviteOverview, MilestoneStopState } from './invite-api';
import { formatPoints, useInviteCopy } from './copy';
import { fillPercent } from './milestone-path';

export type InviteMilestonesProps = {
  milestones: InviteOverview['milestones'];
  onClaim: () => void;
  claiming: boolean;
  /** Az önce talep edilen kademeler — kısa kutlama (≤ 1,2 sn, azaltılmış harekette yok). */
  justClaimed: number[];
};

const STATE_ICON: Record<MilestoneStopState, typeof Check> = { claimed: Check, claimable: Gift, locked: Lock };

export function InviteMilestones({ milestones, onClaim, claiming, justClaimed }: InviteMilestonesProps) {
  const { copy, locale } = useInviteCopy();
  const policy = useMotionPolicy();
  const counts = milestones.stops.map((s) => s.count);
  const pct = fillPercent(milestones.completed, counts);
  const last = counts[counts.length - 1] ?? 0;
  const next = milestones.next;
  const valueText = next
    ? `${milestones.completed}/${next.count} — ${copy.nextMilestone(next.remaining, formatPoints(next.points, locale))}`
    : copy.allMilestonesDone;

  return (
    <SectionCard
      title={copy.milestonesTitle}
      description={copy.milestonesDesc}
      icon={<Trophy />}
      tone="brand"
    >
      <div className="px-1 pb-1 pt-2">
        <div className="relative h-3">
          <div
            role="progressbar"
            aria-label={copy.progressLabel}
            aria-valuemin={0}
            aria-valuemax={last}
            aria-valuenow={Math.min(milestones.completed, last)}
            aria-valuetext={valueText}
            className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, hsl(var(--gradient-from)), hsl(var(--gradient-to)))',
                transition: policy.reduce ? 'none' : `width ${DURATION_MS.slow}ms ${EASE_CSS.emphasized}`,
              }}
            />
          </div>
        </div>

        <ol className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${counts.length}, minmax(0, 1fr))` }}>
          {milestones.stops.map((stop) => {
            const Icon = STATE_ICON[stop.state];
            const celebrate = justClaimed.includes(stop.count) && policy.allowCelebrate;
            const stateText =
              stop.state === 'claimed' ? copy.stateClaimed : stop.state === 'claimable' ? copy.stateClaimable : copy.stateLocked(stop.remaining);
            return (
              <li key={stop.count} className="flex min-w-0 flex-col items-center text-center">
                {/* Konum sarmalayıcıda; ölçek animasyonu içteki Motion'da (framer transform çakışmaz). */}
                <div className="-mt-7 grid place-items-center">
                  <Motion.span
                    aria-hidden
                    initial={false}
                    animate={celebrate ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                    transition={celebrate ? { duration: DURATION.celebrate * 0.6, ...SPRING.bouncy } : { duration: 0 }}
                    className={cn(
                      'grid size-9 place-items-center rounded-full border-2 qx-elevation-1',
                      stop.state === 'claimed' && 'border-success-border bg-success text-success-fg',
                      stop.state === 'claimable' && 'border-warning-border bg-warning text-warning-fg ring-4 ring-warning/25',
                      stop.state === 'locked' && 'border-strong bg-surface-1 text-fg-subtle'
                    )}
                  >
                    <Icon className="size-4" strokeWidth={2.5} />
                  </Motion.span>
                </div>
                <p className="qx-caption mt-1.5 font-semibold text-fg">{copy.milestoneStop(stop.count)}</p>
                <p className="qx-caption tabular-nums text-brand">+{formatPoints(stop.points, locale)}</p>
                <p
                  className={cn(
                    'qx-caption',
                    stop.state === 'claimed' && 'text-success',
                    stop.state === 'claimable' && 'font-semibold text-warning',
                    stop.state === 'locked' && 'text-fg-muted'
                  )}
                >
                  {stateText}
                </p>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 space-y-3">
          {milestones.claimablePoints > 0 && (
            <Button type="button" size="lg" onClick={onClaim} disabled={claiming} className="min-h-12 w-full">
              {claiming ? (
                <>
                  <Loader2 aria-hidden className="mr-2 size-5 animate-spin motion-reduce:animate-none" />
                  {copy.claiming}
                </>
              ) : (
                <>
                  <Gift aria-hidden className="mr-2 size-5" />
                  {copy.claim(formatPoints(milestones.claimablePoints, locale))}
                </>
              )}
            </Button>
          )}
          <p className="qx-small text-center text-fg-muted">
            {next ? copy.nextMilestone(next.remaining, formatPoints(next.points, locale)) : copy.allMilestonesDone}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
