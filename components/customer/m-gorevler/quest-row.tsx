'use client';

import { playSound } from '@/lib/sound';

import { useEffect, useRef, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { CheckCircle2, ChevronRight, Gift, Loader2, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountdownChip } from '@/components/ds/play';
import { DURATION, EASE, listItem, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { QuestGlyph } from './quest-glyph';
import { DrawCheck } from '@/components/fx/event-fx';
import { formatCount, type QuestCopy } from './copy';
import type { QuestDTO } from './types';

export function RewardChips({
  reward,
  copy,
  locale,
  muted = false,
}: {
  reward: QuestDTO['reward'];
  copy: QuestCopy;
  locale: 'tr' | 'en';
  muted?: boolean;
}) {
  return (
    <span className="inline-flex shrink-0 flex-wrap items-center gap-1">
      {reward.points > 0 ? (
        <span
          className={cn(
            'qx-caption qx-num inline-flex h-6 items-center gap-1 rounded-chip px-2 font-semibold ring-1 ring-inset',
            muted ? 'bg-surface-2 text-fg-muted ring-subtle' : 'bg-warning-subtle text-warning ring-warning-border',
          )}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          {copy.points(`+${formatCount(reward.points, locale)}`)}
        </span>
      ) : null}
      {reward.xp > 0 ? (
        <span
          className={cn(
            'qx-caption qx-num inline-flex h-6 items-center gap-1 rounded-chip px-2 font-semibold ring-1 ring-inset',
            muted ? 'bg-surface-2 text-fg-muted ring-subtle' : 'bg-brand-subtle text-brand ring-brand-border',
          )}
        >
          <Zap className="h-3 w-3" aria-hidden />
          {copy.xp(`+${formatCount(reward.xp, locale)}`)}
        </span>
      ) : null}
    </span>
  );
}

/** İnce ilerleme çubuğu — yalnız değer değişince akar (ilk boyamada sabit). */
export function QuestProgressBar({ value, target, tone }: { value: number; target: number; tone: 'brand' | 'success' | 'muted' }) {
  const reduce = useReducedMotionPref();
  const pct = target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
      <Motion.div
        className={cn(
          'h-full rounded-full',
          tone === 'success' ? 'bg-success' : tone === 'muted' ? 'bg-fg-subtle' : 'bg-brand',
        )}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={reduce ? { duration: 0 } : { duration: DURATION.slow, ease: EASE.standard }}
      />
    </div>
  );
}

export interface QuestRowProps {
  quest: QuestDTO;
  index: number;
  copy: QuestCopy;
  locale: 'tr' | 'en';
  claiming: boolean;
  claimDisabled: boolean;
  onOpen: (quest: QuestDTO) => void;
  onClaim: (quest: QuestDTO) => void;
  onExpire?: () => void;
}

/**
 * Görev satırı. Bilgi alanı tek bir buton (ayrıntı sayfası açılır: nasıl ilerlerim + CTA);
 * "Ödülü al" ayrı, metinli, ≥ 44px buton — mobilde tam genişlik (Bulgu 10).
 */
export function QuestRow({ quest, index, copy, locale, claiming, claimDisabled, onOpen, onClaim, onExpire }: QuestRowProps) {
  const claimable = quest.state === 'claimable';
  const done = quest.state === 'claimed' || quest.state === 'auto_rewarded';
  const statusText =
    quest.state === 'claimed'
      ? copy.claimed
      : quest.state === 'auto_rewarded'
        ? copy.autoRewarded
        : claimable
          ? copy.completed
          : copy.inProgress;
  // Bu oturumda talep edilip "tamamlandı"ya geçtiyse: tik çizilir + kart hafifçe zıplar (yalnız geçişte).
  const prevState = useRef(quest.state);
  const [justDone, setJustDone] = useState(false);
  useEffect(() => {
    if (prevState.current !== quest.state && done && prevState.current !== 'claimed' && prevState.current !== 'auto_rewarded') {
      setJustDone(true);
      playSound('task-complete');
    }
    prevState.current = quest.state;
  }, [quest.state, done]);

  return (
    <Motion.li
      variants={listItem}
      custom={index}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(
        'rounded-card border bg-surface-1 qx-elevation-1',
        claimable ? 'border-success-border' : 'border-subtle',
        done && 'bg-surface-0',
        justDone && 'qx-fx-bump',
      )}
    >
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <button
          type="button"
          onClick={() => onOpen(quest)}
          className="group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <QuestGlyph icon={quest.icon} mechanic={quest.mechanic} state={quest.state} />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex min-w-0 items-start justify-between gap-2">
              <span className={cn('qx-body min-w-0 font-semibold leading-snug', done ? 'text-fg-muted' : 'text-fg')}>
                {quest.name}
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden />
            </span>
            <QuestProgressBar
              value={quest.progress}
              target={quest.target}
              tone={claimable ? 'success' : done ? 'muted' : 'brand'}
            />
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="qx-caption qx-num font-medium text-fg-muted">
                <span className="sr-only">{copy.progressAria(quest.name, quest.progress, quest.target)} · </span>
                <span aria-hidden>
                  {formatCount(quest.progress, locale)}/{formatCount(quest.target, locale)}
                </span>
              </span>
              <span
                className={cn(
                  'qx-caption inline-flex items-center gap-1 font-medium',
                  claimable ? 'text-success' : done ? 'text-fg-muted' : 'text-fg-muted',
                )}
              >
                {done ? justDone ? <DrawCheck className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : null}
                {statusText}
              </span>
              <RewardChips reward={quest.reward} copy={copy} locale={locale} muted={done} />
            </span>
          </span>
        </button>

        {claimable ? (
          <Button
            type="button"
            onClick={() => onClaim(quest)}
            disabled={claimDisabled}
            aria-label={copy.claimAria(quest.name)}
            aria-busy={claiming || undefined}
            className="min-h-11 w-full shrink-0 bg-success text-success-fg shadow-none hover:bg-success/90 sm:w-auto"
          >
            {claiming ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Gift className="h-4 w-4" aria-hidden />}
            {claiming ? copy.claiming : copy.claim}
          </Button>
        ) : quest.group === 'season' && quest.endsAt && !done ? (
          <CountdownChip target={quest.endsAt} size="sm" label={copy.endsIn} onExpire={onExpire} className="self-start sm:self-center" />
        ) : null}
      </div>
    </Motion.li>
  );
}
