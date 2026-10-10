'use client';

import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Gift, QrCode, Target } from 'lucide-react';
import { toast } from 'sonner';
import { m as Motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CountdownChip, GlowCard } from '@/components/ds/play';
import { InlineError } from '@/components/states';
import { DURATION, EASE, useNumberTicker, useReducedMotionPref } from '@/lib/motion';
import { moments } from '@/lib/moments/client';
import { WEEKLY_GOAL_TIERS } from '@/lib/squads/rules';
import type { WeeklyGoalDto } from '@/lib/squads/dto';
import { squadApi } from './api';
import { useKlanCopy } from './copy';
import { useErrorText, useRefreshSquad } from './use-klan';

/** "Bu hafta" kartı — sayfanın ana odağı (yeniden tasarım vizyonu madde 2). */
export function WeeklyGoalCard({ goal, frozen }: { goal: WeeklyGoalDto; frozen: boolean }) {
  const copy = useKlanCopy();
  const errorText = useErrorText();
  const refresh = useRefreshSquad();
  const reduce = useReducedMotionPref();
  const shown = useNumberTicker(goal.progress);
  const tier = copy.tiers[WEEKLY_GOAL_TIERS[goal.tier].key];

  const claim = useMutation({
    mutationFn: squadApi.claimGoal,
    onSuccess: async (r) => {
      // Puan kutlaması An Motoru'ndan (tek kapsül); yoksa sade tost.
      const shownByMoment = moments.points({ points: r.reward, xp: Math.floor(r.reward / 2) });
      if (!shownByMoment) toast.success(copy.goalClaimSuccess(r.reward));
      moments.refresh();
      await refresh();
    },
  });

  return (
    <GlowCard accent={goal.completed ? 'success' : 'brand'} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <Target className="h-5 w-5 shrink-0 text-brand" aria-hidden />
            {copy.goalTitle}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{copy.goalDesc(goal.target)}</p>
        </div>
        <CountdownChip mode="week" size="sm" />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="font-display text-3xl font-bold tabular-nums text-fg">
            {shown}
            <span className="text-base font-medium text-fg-muted">/{goal.target}</span>
          </span>
          <span className="text-xs font-medium text-fg-muted">
            {tier.label} · {copy.goalReward(goal.reward)}
          </span>
        </div>
        <div
          className="relative h-3 overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={goal.target}
          aria-valuenow={goal.progress}
          aria-valuetext={copy.goalProgress(goal.progress, goal.target)}
          aria-label={copy.goalTitle}
        >
          <Motion.div
            className={goal.completed ? 'h-full rounded-full bg-success' : 'h-full rounded-full bg-brand'}
            initial={false}
            animate={{ width: `${goal.percent}%` }}
            transition={reduce ? { duration: 0 } : { duration: DURATION.slow, ease: EASE.emphasized }}
          />
        </div>
        <p className="mt-2 text-sm text-fg-muted">{copy.goalMine(goal.myContribution)}</p>
      </div>

      {claim.isError ? <InlineError variant="banner">{errorText(claim.error)}</InlineError> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {goal.claimed ? (
          <p className="flex min-h-11 items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="h-5 w-5" aria-hidden /> {copy.goalClaimed}
          </p>
        ) : goal.canClaim ? (
          <Button onClick={() => claim.mutate()} loading={claim.isPending} className="sm:w-auto">
            <Gift className="h-4 w-4" aria-hidden /> {copy.goalClaim(goal.reward)}
          </Button>
        ) : goal.completed && !frozen ? (
          <p className="text-sm text-fg-muted">
            <span className="font-medium text-success">{copy.goalDone}</span> {copy.goalNeedContribution}
          </p>
        ) : null}
        {!goal.claimed ? (
          <Button asChild variant={goal.canClaim ? 'outline' : 'default'} className="sm:w-auto">
            <Link href="/customer/scan">
              <QrCode className="h-4 w-4" aria-hidden /> {copy.goalCta}
            </Link>
          </Button>
        ) : null}
      </div>
    </GlowCard>
  );
}
