'use client';

import { useId } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronRight, Hand, ListChecks, MessageSquareText, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SeverityBadge, StatusBadge } from '@/components/ds/data';
import { TONE_STRIPE } from '@/components/states';
import type { WorkItem } from '@/lib/dealer-queues/types';
import { DueChip, PersonChip, RelTime } from '../shared/ui';
import { useSharedCopy } from '../shared/copy';
import { useAssignedCopy } from './copy';

const STRIPE = { critical: TONE_STRIPE.danger, high: TONE_STRIPE.danger, medium: TONE_STRIPE.warning, low: TONE_STRIPE.neutral } as const;

export function WorkRow({
  item,
  meId,
  readOnly,
  busy,
  onOpen,
  onStart,
  onComplete,
  onClaim,
  onResolve,
}: {
  item: WorkItem;
  meId: string;
  readOnly: boolean;
  busy: boolean;
  onOpen: () => void;
  onStart: () => void;
  onComplete: () => void;
  onClaim: () => void;
  onResolve: () => void;
}) {
  const copy = useAssignedCopy();
  const shared = useSharedCopy();
  const titleId = useId();
  const open = item.status === 'open' || item.status === 'in_progress';
  const mine = item.assignee?.id === meId;
  const KindIcon = item.kind === 'task' ? ListChecks : AlertTriangle;
  const sourceLabel = item.kind === 'task' ? (shared.taskSource[item.sourceKind] ?? item.sourceLabel) : item.sourceLabel;

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'relative flex gap-3 overflow-hidden rounded-card border bg-surface-1 p-3 pl-4 sm:p-4 sm:pl-5 transition-colors duration-fast hover:border-strong',
        item.overdue ? 'border-danger-border' : 'border-subtle'
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', open ? (item.overdue ? TONE_STRIPE.danger : STRIPE[item.priority]) : 'bg-success')} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="qx-caption inline-flex items-center gap-1 rounded-chip bg-surface-muted px-1.5 py-0.5 text-fg-muted ring-1 ring-inset ring-border">
            <KindIcon aria-hidden className="h-3 w-3" />
            {copy.kindLabel[item.kind]}
          </span>
          <SeverityBadge severity={item.priority} size="sm" label={shared.priority[item.priority]} />
          {item.status !== 'open' ? (
            <StatusBadge
              size="sm"
              tone={item.status === 'done' ? 'success' : item.status === 'cancelled' ? 'neutral' : 'info'}
              label={shared.workStatus[item.status]}
            />
          ) : null}
          {item.impactScore != null ? <span className="qx-caption text-fg-subtle">{copy.impact(item.impactScore)}</span> : null}
        </div>
        <h3 id={titleId} className="qx-body font-semibold text-fg">
          <button
            type="button"
            onClick={onOpen}
            className="text-left hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.title}
          </button>
        </h3>
        {item.excerpt ? <p className="qx-small line-clamp-2 text-fg-muted">{item.excerpt}</p> : null}
        <div className="qx-caption flex flex-wrap items-center gap-x-3 gap-y-1.5 text-fg-muted">
          <span className="inline-flex items-center gap-1">
            {item.feedbackHref ? <MessageSquareText aria-hidden className="h-3.5 w-3.5" /> : null}
            {sourceLabel}
          </span>
          <span>
            {open ? copy.createdRel('') : copy.closedRel('')}
            <RelTime iso={open ? item.createdAt : (item.closedAt ?? item.createdAt)} />
          </span>
          {open ? <DueChip dueAt={item.dueAt} overdue={item.overdue} /> : null}
          <PersonChip person={item.assignee} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {open && !readOnly ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {item.kind === 'task' ? (
              <>
                {item.status === 'open' ? (
                  <Button type="button" variant="outline" className="min-w-11 px-3 shadow-none" disabled={busy} onClick={onStart} aria-label={copy.startFor(item.title)}>
                    <Play aria-hidden className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">{copy.start}</span>
                  </Button>
                ) : null}
                <Button type="button" className="min-w-11 px-3 shadow-none" disabled={busy} onClick={onComplete} aria-label={copy.completeFor(item.title)}>
                  <Check aria-hidden className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">{copy.complete}</span>
                </Button>
              </>
            ) : (
              <>
                {!mine ? (
                  <Button type="button" variant="outline" className="min-w-11 px-3 shadow-none" disabled={busy} onClick={onClaim} aria-label={`${copy.claim}: ${item.title}`}>
                    <Hand aria-hidden className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">{copy.claim}</span>
                  </Button>
                ) : null}
                <Button type="button" className="min-w-11 px-3 shadow-none" disabled={busy} onClick={onResolve} aria-label={`${shared.incidentStatus.resolved}: ${item.title}`}>
                  <CheckCircle2 aria-hidden className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">{copy.complete}</span>
                </Button>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="grid h-11 w-11 place-items-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={copy.openFor(item.title)}
          >
            <ChevronRight aria-hidden className="h-5 w-5" />
          </button>
        )}
      </div>
    </article>
  );
}
