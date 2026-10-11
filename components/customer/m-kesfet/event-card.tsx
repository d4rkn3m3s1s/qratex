'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { CalendarClock, CheckCircle2, Gamepad2, Gift, MessageSquareText, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { announce } from '@/components/ds/a11y';
import { StatusBadge } from '@/components/ds/data';
import { CountdownChip } from '@/components/ds/play';
import { TONE_CHIP } from '@/components/states';
import { popIn, useMotionPolicy } from '@/lib/motion';
import { moments } from '@/lib/moments/client';
import { cn } from '@/lib/utils';
import type { SeasonalEventDto } from '@/lib/places/types';
import { claimEventReward, placesKeys } from './api';
import { usePlacesCopy } from './copy';
import { formatDate, formatMultiplierLabel } from './format';

/**
 * Sezonluk etkinlik kartı: geri sayım `endDate`'ten (arka planda kaymaz; bitince veri tazelenir),
 * çarpanın NEREDE geçerli olduğu, görev ilerlemesi (`progressbar`), türüne göre eylem bağlantısı,
 * ödül talebi ve kutlama (azaltılmış harekette statik). Bitmiş etkinlik talep süresinde görünür.
 */
export function EventCard({ event, highlight = false }: { event: SeasonalEventDto; highlight?: boolean }) {
  const { copy, locale } = usePlacesCopy();
  const qc = useQueryClient();
  const policy = useMotionPolicy();
  const ch = event.challenge;

  const claim = useMutation({
    mutationFn: () => claimEventReward(event.id),
    onSuccess: (r) => {
      const msg = copy.claimSuccess(r.points);
      announce(msg, { politeness: 'assertive' });
      const shown = r.points > 0 ? moments.points({ points: r.points, xp: r.points }) : false;
      if (!shown) toast.success(msg);
      moments.refresh();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : copy.saveError);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['customer', 'places', 'deals'] });
    },
  });

  const claimed = !!ch?.claimed || claim.isSuccess;
  const ratio = ch ? Math.min(1, ch.current / Math.max(1, ch.goal)) : 0;
  const remaining = ch ? Math.max(0, ch.goal - ch.current) : 0;

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-card border bg-surface-1',
        highlight ? 'border-brand-border ring-2 ring-brand-border' : 'border-subtle',
      )}
      aria-labelledby={`event-${event.id}`}
    >
      {event.imageUrl && (
        <div className="relative h-28 w-full bg-surface-muted sm:h-36">
          <Image src={event.imageUrl} alt="" fill unoptimized sizes="(max-width: 640px) 100vw, 640px" className="object-cover" />
        </div>
      )}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 id={`event-${event.id}`} className="qx-h3 min-w-0 flex-1 text-fg">
            {event.name}
          </h3>
          {event.phase === 'active' ? (
            <CountdownChip
              target={event.endDate}
              urgentWithinMs={60 * 60 * 1000}
              onExpire={() => void qc.invalidateQueries({ queryKey: ['customer', 'places', 'deals'] })}
            />
          ) : (
            <StatusBadge label={copy.eventEnded} tone="neutral" icon={CalendarClock} size="sm" />
          )}
        </div>
        {event.description && <p className="qx-small text-fg-muted">{event.description}</p>}

        {(event.multiplier > 1 || event.bonusPoints > 0) && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5">
              {event.multiplier > 1 && (
                <span className={cn('qx-caption inline-flex items-center gap-1 rounded-chip px-2 py-1 font-semibold', TONE_CHIP.brand)}>
                  <Sparkles aria-hidden className="h-3.5 w-3.5" />
                  {copy.eventMultiplier(formatMultiplierLabel(event.multiplier, locale))}
                </span>
              )}
              {event.bonusPoints > 0 && (
                <span className={cn('qx-caption inline-flex items-center gap-1 rounded-chip px-2 py-1 font-semibold', TONE_CHIP.success)}>
                  <Gift aria-hidden className="h-3.5 w-3.5" />
                  {copy.eventBonus(event.bonusPoints)}
                </span>
              )}
            </div>
            <p className="qx-caption text-fg-muted">{copy.eventApplies}</p>
          </div>
        )}

        {event.phase === 'ended' && <p className="qx-small font-medium text-warning">{copy.eventClaimUntil(formatDate(event.claimDeadline, locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}</p>}

        {ch && (
          <div className="flex flex-col gap-2 rounded-control bg-surface-muted p-3">
            <p className="qx-body font-semibold text-fg">{copy.challengeGoal(ch.type, ch.goal)}</p>
            <div
              role="progressbar"
              aria-label={copy.challengeProgress}
              aria-valuemin={0}
              aria-valuemax={ch.goal}
              aria-valuenow={Math.min(ch.current, ch.goal)}
              aria-valuetext={`${Math.min(ch.current, ch.goal)}/${ch.goal}`}
              className="h-2.5 w-full overflow-hidden rounded-full bg-surface-1"
            >
              <Motion.div
                className="h-full rounded-full bg-brand"
                initial={policy.reduce ? false : { width: 0 }}
                animate={{ width: `${ratio * 100}%` }}
                transition={policy.transition({ type: 'spring', stiffness: 160, damping: 24 })}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="qx-small qx-num text-fg-muted">
                {Math.min(ch.current, ch.goal)}/{ch.goal}
                {!ch.complete && ` · ${copy.challengeRemaining(ch.type, remaining)}`}
              </span>
              <span className="qx-small font-medium text-fg">{copy.challengeReward(ch.rewardPoints, ch.rewardBadge?.name ?? null)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <AnimatePresence mode="wait" initial={false}>
                {claimed ? (
                  <Motion.span
                    key="claimed"
                    variants={policy.variants(popIn)}
                    initial="hidden"
                    animate="visible"
                    className={cn('qx-small inline-flex items-center gap-1.5 rounded-chip px-3 py-2 font-semibold', TONE_CHIP.success)}
                  >
                    <CheckCircle2 aria-hidden className="h-4 w-4" />
                    {copy.claimed}
                  </Motion.span>
                ) : ch.complete ? (
                  <Motion.span key="claim" variants={policy.variants(popIn)} initial="hidden" animate="visible" className="inline-flex">
                    <Button type="button" className="min-h-11" onClick={() => claim.mutate()} disabled={claim.isPending} aria-busy={claim.isPending}>
                      <Gift aria-hidden className="mr-2 h-4 w-4" />
                      {claim.isPending ? copy.claiming : copy.claim}
                    </Button>
                  </Motion.span>
                ) : event.phase === 'active' ? (
                  <Button key="cta" asChild variant="outline" className="min-h-11">
                    <Link href={ch.type === 'games_played' ? '/customer/games' : '/customer/wallet/activity'}>
                      {ch.type === 'games_played' ? <Gamepad2 aria-hidden className="mr-2 h-4 w-4" /> : <MessageSquareText aria-hidden className="mr-2 h-4 w-4" />}
                      {ch.type === 'games_played' ? copy.challengeCtaGames : copy.challengeCtaReviews}
                    </Link>
                  </Button>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
