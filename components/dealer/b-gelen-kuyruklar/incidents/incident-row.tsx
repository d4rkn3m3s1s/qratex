'use client';

import { useId } from 'react';
import { CheckCircle2, ChevronRight, Hand, MessagesSquare, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SeverityBadge, StatusBadge } from '@/components/ds/data';
import { TONE_STRIPE } from '@/components/states';
import { incidentTypeDef } from '@/lib/dealer-queues/incident-catalog';
import type { IncidentItem } from '@/lib/dealer-queues/types';
import { DueChip, PersonChip, RelTime } from '../shared/ui';
import { useQueueLocale, useSharedCopy } from '../shared/copy';
import { useIncidentCopy } from './copy';

const STRIPE = { critical: TONE_STRIPE.danger, high: TONE_STRIPE.danger, medium: TONE_STRIPE.warning, low: TONE_STRIPE.neutral } as const;

export function IncidentRow({
  item,
  onOpen,
  onClaim,
  onResolve,
  busy,
  readOnly,
  meId,
}: {
  item: IncidentItem;
  onOpen: () => void;
  onClaim: () => void;
  onResolve: () => void;
  busy: boolean;
  readOnly: boolean;
  meId: string;
}) {
  const copy = useIncidentCopy();
  const shared = useSharedCopy();
  const locale = useQueueLocale();
  const titleId = useId();
  const def = incidentTypeDef(item.type);
  const open = item.status !== 'resolved';
  const mine = item.assignee?.id === meId;

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'relative flex gap-3 overflow-hidden rounded-card border bg-surface-1 p-3 pl-4 sm:p-4 sm:pl-5 transition-colors duration-fast hover:border-strong',
        item.severity === 'critical' && open ? 'border-danger-border' : 'border-subtle'
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', open ? STRIPE[item.severity] : 'bg-success')} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={item.severity} size="sm" emphasize={item.severity === 'critical' && open} />
          <span className="qx-caption inline-flex items-center gap-1 rounded-chip bg-surface-muted px-1.5 py-0.5 text-fg-muted ring-1 ring-inset ring-border">
            {item.typeGroup === 'table' ? <Table2 aria-hidden className="h-3 w-3" /> : null}
            {def.label[locale]}
          </span>
          {item.status !== 'open' ? (
            <StatusBadge
              size="sm"
              tone={item.status === 'resolved' ? 'success' : item.status === 'in_progress' ? 'info' : 'neutral'}
              label={shared.incidentStatus[item.status]}
            />
          ) : null}
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
        {item.table && item.table.reasons.length ? (
          <p className="qx-small text-fg-muted">
            {item.table.label} · {item.table.reasons.map((r) => shared.tableReason[r] ?? r).join(', ')}
          </p>
        ) : item.excerpt ? (
          <p className="qx-small line-clamp-2 text-fg-muted">{item.excerpt}</p>
        ) : null}
        <div className="qx-caption flex flex-wrap items-center gap-x-3 gap-y-1.5 text-fg-muted">
          <span>
            {open ? copy.createdRel('') : copy.resolvedRel('')}
            <RelTime iso={open ? item.createdAt : (item.resolvedAt ?? item.updatedAt)} />
          </span>
          {open ? <DueChip dueAt={item.dueAt} overdue={item.overdue} /> : null}
          <PersonChip person={item.assignee} />
          {item.feedbackCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <MessagesSquare aria-hidden className="h-3.5 w-3.5" />
              {copy.evidence(item.feedbackCount)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {open && !readOnly ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {!mine ? (
              <Button type="button" variant="outline" className="min-w-11 px-3 shadow-none" onClick={onClaim} disabled={busy} aria-label={copy.claimFor(item.title)}>
                <Hand aria-hidden className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">{copy.claim}</span>
              </Button>
            ) : null}
            <Button type="button" className="min-w-11 px-3 shadow-none" onClick={onResolve} disabled={busy} aria-label={copy.resolveFor(item.title)}>
              <CheckCircle2 aria-hidden className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">{copy.resolve}</span>
            </Button>
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
