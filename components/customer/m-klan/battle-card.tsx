'use client';

import { useEffect, useState } from 'react';
import { Check, Crown, Shield, Swords, Trophy, Undo2, X } from 'lucide-react';
import { m as Motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Ambient, CountdownChip, GlowCard } from '@/components/ds/play';
import { ConfirmAction } from '@/components/states';
import { cn } from '@/lib/utils';
import { SPRING, useNumberTicker, useReducedMotionPref } from '@/lib/motion';
import { triggerConfetti } from '@/lib/effects/confetti';
import type { BattleResultDto, BattleState, CurrentBattleDto } from '@/lib/squads/dto';
import { squadApi } from './api';
import { useKlanCopy, useKlanLocale } from './copy';
import { MemberAvatar, SquadEmblem } from './parts';
import { ChallengeDialog } from './challenge-dialog';
import { useConfirmRunner, useRefreshSquad } from './use-klan';

function hoursBetween(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000));
}

function Score({ value, className }: { value: number; className?: string }) {
  const shown = useNumberTicker(value);
  const { tag } = useKlanLocale();
  return <span className={cn('font-display font-bold tabular-nums', className)}>{shown.toLocaleString(tag)}</span>;
}

/** Halat çekme çubuğu: oran değişince yay ile kayar (azaltılmış harekette anında). */
function TugOfWar({ mine, theirs }: { mine: number; theirs: number }) {
  const reduce = useReducedMotionPref();
  const copy = useKlanCopy();
  const total = mine + theirs;
  const pct = total === 0 ? 50 : Math.round((mine / total) * 100);
  return (
    <div
      className="relative flex h-4 overflow-hidden rounded-full bg-danger-subtle"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={`${copy.us} %${pct} · ${copy.them} %${100 - pct}`}
    >
      <Motion.div
        className="h-full rounded-l-full bg-brand"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={reduce ? { duration: 0 } : SPRING.gentle}
      />
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-surface-0/70" />
    </div>
  );
}

function ActiveBattle({ battle, onExpire }: { battle: CurrentBattleDto; onExpire: () => void }) {
  const copy = useKlanCopy();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-subtle px-2.5 py-1 text-xs font-semibold text-danger">
          <Ambient as="span" className="inline-flex" fallback={<span aria-hidden className="h-2 w-2 rounded-full bg-danger" />}>
            {(running) => <span aria-hidden className={cn('h-2 w-2 rounded-full bg-danger', running && 'animate-pulse')} />}
          </Ambient>
          {copy.live}
        </span>
        <CountdownChip target={battle.endTime} label={copy.ends} size="sm" onExpire={onExpire} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg-muted">{battle.mine.name}</p>
          <Score value={battle.mine.score} className="text-3xl text-brand-text sm:text-4xl" />
        </div>
        <span className="text-xs font-semibold uppercase text-fg-subtle">{copy.vs}</span>
        <div className="min-w-0 text-right">
          <p className="truncate text-xs font-medium text-fg-muted">{battle.opponent.name}</p>
          <Score value={battle.opponent.score} className="text-3xl text-danger sm:text-4xl" />
        </div>
      </div>
      <TugOfWar mine={battle.mine.score} theirs={battle.opponent.score} />
      <p className="text-sm text-fg-muted">{copy.stake(battle.rewardFunded ? battle.rewardPool : 0)}</p>
      <p className={cn('text-sm', battle.amParticipant ? 'font-medium text-fg' : 'text-fg-muted')}>
        {battle.amParticipant ? copy.myContribution(battle.myContribution ?? 0) : copy.notInRoster}
      </p>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{copy.topContributors}</h3>
        {battle.topContributors.length === 0 ? (
          <p className="text-sm text-fg-muted">{copy.noContributors}</p>
        ) : (
          <ul className="space-y-1.5">
            {battle.topContributors.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-center gap-2.5">
                <MemberAvatar name={c.name} image={c.image} size={28} />
                <span className={cn('min-w-0 flex-1 truncate text-sm', c.isMe ? 'font-semibold text-fg' : 'text-fg')}>
                  {c.name}
                  {c.isMe ? ` · ${copy.you}` : ''}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                    c.side === 'mine' ? 'bg-brand-subtle text-brand-text' : 'bg-danger-subtle text-danger'
                  )}
                >
                  {c.side === 'mine' ? copy.us : copy.them} · {c.score}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PendingBattle({ battle }: { battle: CurrentBattleDto }) {
  const copy = useKlanCopy();
  const run = useConfirmRunner();
  const hours = hoursBetween(battle.startTime, battle.endTime);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SquadEmblem id={battle.opponent.id} name={battle.opponent.name} />
        <div className="min-w-0">
          <p className="font-semibold text-fg">
            {battle.isChallenger
              ? copy.pendingOut(battle.opponent.name)
              : battle.canRespond
                ? copy.pendingIn(battle.opponent.name)
                : copy.pendingInMember(battle.opponent.name)}
          </p>
          <p className="text-sm text-fg-muted">
            {copy.stake(battle.rewardFunded ? battle.rewardPool : 0)} · {copy.hours(hours)}
          </p>
        </div>
      </div>
      <CountdownChip target={battle.endTime} label={copy.pendingExpires} size="sm" />
      <p className="text-xs text-fg-muted">{copy.stakeNote}</p>
      {battle.canRespond ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <ConfirmAction
            tone="brand"
            trigger={
              <Button className="sm:flex-1">
                <Check className="h-4 w-4" aria-hidden /> {copy.accept}
              </Button>
            }
            title={copy.acceptTitle}
            description={copy.acceptBody(hours)}
            confirmLabel={copy.accept}
            irreversibleNote={false}
            onConfirm={() => run(() => squadApi.respond(battle.id, 'accept'), () => copy.battleStarted)}
          />
          <ConfirmAction
            tone="warning"
            trigger={
              <Button variant="outline" className="sm:flex-1">
                <X className="h-4 w-4" aria-hidden /> {copy.reject}
              </Button>
            }
            title={copy.rejectTitle}
            description={copy.rejectBody}
            confirmLabel={copy.reject}
            onConfirm={() => run(() => squadApi.respond(battle.id, 'reject'), () => copy.updated)}
          />
        </div>
      ) : null}
      {battle.canWithdraw ? (
        <ConfirmAction
          tone="warning"
          trigger={
            <Button variant="outline">
              <Undo2 className="h-4 w-4" aria-hidden /> {copy.withdraw}
            </Button>
          }
          title={copy.withdrawTitle}
          description={copy.withdrawBody(battle.rewardFunded ? battle.rewardPool : 0)}
          confirmLabel={copy.withdraw}
          onConfirm={() => run(() => squadApi.withdraw(battle.id), () => copy.updated)}
        />
      ) : null}
    </div>
  );
}

const SEEN_PREFIX = 'qx-klan-result-seen:';

export function BattleResult({ result, compact = false }: { result: BattleResultDto; compact?: boolean }) {
  const copy = useKlanCopy();
  const { tag } = useKlanLocale();
  const title =
    result.outcome === 'won'
      ? copy.resultWon
      : result.outcome === 'lost'
        ? copy.resultLost
        : result.outcome === 'draw'
          ? copy.resultDraw
          : copy.resultCancelled;
  const Icon = result.outcome === 'won' ? Trophy : result.outcome === 'cancelled' ? X : Shield;
  return (
    <div className={cn('flex items-start gap-3', compact ? '' : 'rounded-xl border border-subtle bg-surface-2/60 p-3')}>
      <span
        aria-hidden
        className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-full',
          result.outcome === 'won' ? 'bg-success-subtle text-success' : 'bg-surface-3 text-fg-muted'
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-fg">
          {title} <span className="font-normal text-fg-muted">· {result.opponent.name}</span>
        </p>
        <p className="text-sm tabular-nums text-fg-muted">
          {result.mine.score.toLocaleString(tag)} – {result.opponent.score.toLocaleString(tag)}
          {result.rewardFunded && result.rewardPool > 0 ? ` · ${copy.stake(result.rewardPool)}` : ''}
        </p>
        {result.myPayout > 0 ? <p className="text-sm font-medium text-success">{copy.resultPayout(result.myPayout)}</p> : null}
        {result.outcome === 'cancelled' && result.cancelReason ? <p className="text-xs text-fg-muted">{result.cancelReason}</p> : null}
        {(result.outcome === 'draw' || result.outcome === 'cancelled') && result.rewardFunded && result.rewardPool > 0 ? (
          <p className="text-xs text-fg-muted">{copy.resultRefundNote}</p>
        ) : null}
        <time dateTime={result.endedAt} className="text-xs text-fg-subtle" suppressHydrationWarning>
          {new Date(result.endedAt).toLocaleString(tag, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' })}
        </time>
      </div>
    </div>
  );
}

/** Savaş kartı — duruma göre: yok / bekleyen / canlı / son sonuç (vizyon madde 3). */
export function BattleCard({
  state,
  isOwner,
  frozen,
  balance,
}: {
  state: BattleState;
  isOwner: boolean;
  frozen: boolean;
  balance: number;
}) {
  const copy = useKlanCopy();
  const refresh = useRefreshSquad();
  const [challengeOpen, setChallengeOpen] = useState(false);
  const { battle, recentResult } = state;

  // Zafer anı: sonuç başına bir kez (tarayıcı belleği yalnız "gördüm" kolaylığı; ödeme sunucuda).
  useEffect(() => {
    if (!recentResult || recentResult.outcome !== 'won') return;
    const key = SEEN_PREFIX + recentResult.id;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, '1');
    } catch {
      return;
    }
    triggerConfetti();
  }, [recentResult]);

  const accent = battle?.status === 'active' ? 'category-5' : battle ? 'warning' : 'brand';
  return (
    <GlowCard accent={accent} className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
        <Swords className="h-5 w-5 shrink-0 text-brand" aria-hidden />
        {copy.battleTitle}
      </h2>
      {battle?.status === 'active' ? (
        <ActiveBattle battle={battle} onExpire={() => void refresh()} />
      ) : battle?.status === 'pending' ? (
        <PendingBattle battle={battle} />
      ) : (
        <div className="space-y-3">
          {recentResult ? <BattleResult result={recentResult} /> : null}
          <p className="text-sm text-fg-muted">{isOwner ? copy.battleNoneOwner : copy.battleNoneMember}</p>
          {isOwner ? (
            <>
              <Button onClick={() => setChallengeOpen(true)} disabled={frozen}>
                <Crown className="h-4 w-4" aria-hidden /> {copy.findOpponent}
              </Button>
              <ChallengeDialog open={challengeOpen} onOpenChange={setChallengeOpen} balance={balance} />
            </>
          ) : null}
        </div>
      )}
    </GlowCard>
  );
}
