'use client';

import { CheckCircle2, Clock, Coins } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { useNumberTicker } from '@/lib/motion';
import type { InviteOverview } from './invite-api';
import { formatPoints, useInviteCopy } from './copy';

/** Davet özeti: tamamlanan / bekleyen + GERÇEK toplam kazanç (davet başı + kademe; aggregate). */
export function InviteStats({ counts, earnings }: Pick<InviteOverview, 'counts' | 'earnings'>) {
  const { copy, locale } = useInviteCopy();
  const total = useNumberTicker(earnings.total);

  return (
    <SectionCard title={copy.statsTitle} density="compact">
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-control border border-subtle bg-surface-2 px-3 py-2.5">
          <dt className="qx-caption flex items-center gap-1.5 text-fg-muted">
            <CheckCircle2 aria-hidden className="size-3.5 text-success" />
            {copy.statCompleted}
          </dt>
          <dd className="font-display text-2xl font-bold tabular-nums text-fg">{formatPoints(counts.completed, locale)}</dd>
        </div>
        <div className="rounded-control border border-subtle bg-surface-2 px-3 py-2.5">
          <dt className="qx-caption flex items-center gap-1.5 text-fg-muted">
            <Clock aria-hidden className="size-3.5 text-warning" />
            {copy.statPending}
          </dt>
          <dd className="font-display text-2xl font-bold tabular-nums text-fg">{formatPoints(counts.pending, locale)}</dd>
        </div>
        <div className="col-span-2 rounded-control border border-brand-border/60 bg-brand-subtle px-3 py-2.5">
          <dt className="qx-caption flex items-center gap-1.5 text-fg-muted">
            <Coins aria-hidden className="size-3.5 text-brand" />
            {copy.statEarned}
          </dt>
          <dd>
            <span className="font-display text-2xl font-bold tabular-nums text-brand" aria-hidden>
              +{formatPoints(total, locale)}
            </span>
            <span className="sr-only">+{formatPoints(earnings.total, locale)} {copy.pointsUnit}</span>
            <span className="qx-caption block text-fg-muted">
              {copy.earnedBreakdown(formatPoints(earnings.perInvite, locale), formatPoints(earnings.milestones, locale))}
            </span>
          </dd>
        </div>
      </dl>
      {counts.expired > 0 && <p className="qx-caption mt-2 text-fg-muted">{copy.statExpiredNote(formatPoints(counts.expired, locale))}</p>}
    </SectionCard>
  );
}
