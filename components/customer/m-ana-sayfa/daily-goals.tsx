'use client';

import Link from 'next/link';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { Check, ChevronRight, Dices, Flame, Gamepad2, Gift, MessageSquarePlus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from '@/components/ds/play/shared';
import { popIn, useMotionPolicy } from '@/lib/motion';
import type { HomeGoal, HomeGoalId } from '@/lib/customer-home/types';
import { useHomeCopy } from './copy';

const ICONS: Record<HomeGoalId, LucideIcon> = {
  streak: Flame,
  review: MessageSquarePlus,
  spin: Dices,
  box: Gift,
  game: Gamepad2,
};

/**
 * Günlük 3 hedef. Durumlar bugünkü (İstanbul) gerçek kayıtlardan gelir; hedef ödül vaat
 * etmez. Tamamlanma anı tek seferlik bir "pop" ile anlatılır (azaltılmış harekette yok).
 */
export function DailyGoals({
  goals,
  streakSaving,
  onSpin,
}: {
  goals: HomeGoal[];
  /** Seri dokunuşu sürüyor (POST bekleniyor). */
  streakSaving: boolean;
  /** Çark hedefinin eylemi (sayfa içi dialog). */
  onSpin: () => void;
}) {
  const { copy } = useHomeCopy();
  const policy = useMotionPolicy();
  const done = goals.filter((g) => g.done).length;
  const total = goals.length;
  const all = total > 0 && done === total;

  return (
    <section aria-labelledby="home-goals-title" className="rounded-card border border-subtle bg-surface-1 p-4 qx-elevation-1 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="home-goals-title" className="qx-h3 text-fg">
          {copy.goalsTitle}
        </h2>
        <GoalMeter done={done} total={total} label={copy.goalsDone(done, total)} />
      </div>

      <ul className="flex flex-col gap-2">
        {goals.map((goal) => (
          <li key={goal.id}>
            <GoalRow goal={goal} saving={goal.id === 'streak' && streakSaving && !goal.done} onSpin={onSpin} />
          </li>
        ))}
      </ul>

      <AnimatePresence initial={false}>
        {all ? (
          <Motion.p
            key="all-done"
            variants={policy.variants(popIn)}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mt-3 rounded-control border border-success-border bg-success-subtle px-3 py-2 qx-small font-medium text-success"
            role="status"
          >
            {copy.goalsAllDone}
          </Motion.p>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function GoalMeter({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <div className="flex items-center gap-2" role="img" aria-label={label}>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-2 w-6 rounded-full transition-colors duration-slow ease-emphasized',
              i < done ? 'bg-success' : 'bg-surface-3'
            )}
          />
        ))}
      </div>
      <span className="qx-caption tabular-nums text-fg-muted" aria-hidden>
        {done}/{total}
      </span>
    </div>
  );
}

function GoalRow({ goal, saving, onSpin }: { goal: HomeGoal; saving: boolean; onSpin: () => void }) {
  const { copy } = useHomeCopy();
  const policy = useMotionPolicy();
  const Icon = ICONS[goal.id];
  const title = copy.goal[goal.id];
  const hint = saving ? copy.goalSaving : copy.goalHint[goal.id];

  const body = (
    <>
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full border',
          goal.done ? 'border-success-border bg-success-subtle text-success' : 'border-subtle bg-surface-2 text-fg-muted'
        )}
        aria-hidden
      >
        <AnimatePresence initial={false} mode="wait">
          {goal.done ? (
            <Motion.span key="done" variants={policy.variants(popIn)} initial="hidden" animate="visible" exit="exit">
              <Check className="size-5" strokeWidth={2.5} />
            </Motion.span>
          ) : (
            <Motion.span key="todo" initial={false}>
              <Icon className="size-5" />
            </Motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block qx-body font-medium', goal.done ? 'text-fg-muted line-through decoration-1' : 'text-fg')}>
          {title}
          <span className="sr-only"> — {goal.done ? copy.goalDoneSr : copy.goalTodoSr}</span>
        </span>
        {!goal.done ? <span className="block qx-small text-fg-muted">{hint}</span> : null}
      </span>
      {!goal.done && (goal.href || goal.id === 'spin') ? <ChevronRight className="size-5 shrink-0 text-fg-subtle" aria-hidden /> : null}
    </>
  );

  const rowClass = cn(
    'flex min-h-14 w-full items-center gap-3 rounded-control px-2 py-2 text-left',
    !goal.done && 'transition-colors duration-fast hover:bg-surface-2',
    FOCUS_RING
  );

  if (goal.done) return <div className={rowClass}>{body}</div>;
  if (goal.id === 'spin') {
    return (
      <button type="button" onClick={onSpin} className={rowClass}>
        {body}
      </button>
    );
  }
  if (goal.href) {
    return (
      <Link href={goal.href} className={rowClass}>
        {body}
      </Link>
    );
  }
  return (
    <div className={rowClass} aria-busy={saving || undefined}>
      {body}
    </div>
  );
}
