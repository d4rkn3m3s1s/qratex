'use client';

import Link from 'next/link';
import { ArrowRight, Award, CheckCircle2, Gift, Loader2, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountdownChip, GlowCard } from '@/components/ds/play';
import { QuestProgressBar } from './quest-row';
import { formatCount, type QuestCopy } from './copy';
import type { SeasonChallengeDTO } from './types';

export interface SeasonCardProps {
  season: SeasonChallengeDTO;
  copy: QuestCopy;
  locale: 'tr' | 'en';
  claiming: boolean;
  claimDisabled: boolean;
  onClaim: () => void;
  onExpire: () => void;
}

/** Aktif sezon etkinliğinin challenge'ı (SeasonalCampaign) — Sezon grubunun başında. */
export function SeasonCard({ season, copy, locale, claiming, claimDisabled, onClaim, onExpire }: SeasonCardProps) {
  const current = Math.min(season.current, season.goal);
  const complete = season.current >= season.goal;
  const labelId = `season-${season.campaignId}`;
  return (
    <GlowCard accent="category-5" className="space-y-3" aria-labelledby={labelId} role="group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="qx-overline inline-flex items-center gap-1.5 text-fg-muted">
            <PartyPopper className="h-3.5 w-3.5" aria-hidden />
            {copy.season.title}
          </p>
          <h3 id={labelId} className="qx-h3 text-fg">
            {season.name}
          </h3>
          <p className="qx-small text-fg-muted">{copy.season.goal[season.type](season.goal)}</p>
        </div>
        <CountdownChip target={season.endsAt} size="sm" label={copy.season.endsIn} onExpire={onExpire} locale={locale} />
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="qx-small qx-num font-semibold text-fg">
            <span className="sr-only">{copy.progressAria(season.name, current, season.goal)} · </span>
            <span aria-hidden>
              {formatCount(current, locale)}/{formatCount(season.goal, locale)}
            </span>
          </span>
          <span className="inline-flex flex-wrap items-center gap-1">
            {season.rewardPoints > 0 ? (
              <span className="qx-caption qx-num inline-flex h-6 items-center rounded-chip bg-warning-subtle px-2 font-semibold text-warning ring-1 ring-inset ring-warning-border">
                {copy.season.reward(formatCount(season.rewardPoints, locale))}
              </span>
            ) : null}
            {season.hasBadge ? (
              <span className="qx-caption inline-flex h-6 items-center gap-1 rounded-chip bg-brand-subtle px-2 font-semibold text-brand ring-1 ring-inset ring-brand-border">
                <Award className="h-3 w-3" aria-hidden />
                {copy.season.badge}
              </span>
            ) : null}
          </span>
        </div>
        <QuestProgressBar value={current} target={season.goal} tone={season.claimed ? 'muted' : complete ? 'success' : 'brand'} />
      </div>

      {season.claimed ? (
        <p className="qx-small inline-flex items-center gap-1.5 font-medium text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {copy.season.claimed}
        </p>
      ) : complete ? (
        <Button
          type="button"
          onClick={onClaim}
          disabled={claimDisabled}
          aria-busy={claiming || undefined}
          className="min-h-11 w-full bg-success text-success-fg shadow-none hover:bg-success/90 sm:w-auto"
        >
          {claiming ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Gift className="h-4 w-4" aria-hidden />}
          {claiming ? copy.claiming : copy.season.claim}
        </Button>
      ) : (
        <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
          <Link href="/customer/event" prefetch={false}>
            {copy.season.open}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      )}
    </GlowCard>
  );
}
