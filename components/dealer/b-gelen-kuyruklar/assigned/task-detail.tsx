'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Check, ExternalLink, Play, RotateCcw, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SeverityBadge, StatusBadge } from '@/components/ds/data';
import { announce } from '@/components/ds/a11y';
import { QueryState } from '@/components/states';
import { TASK_PRIORITIES, type TaskPriority, type WorkStatus } from '@/lib/dealer-queues/work-core';
import type { AssigneeDto, TaskDetail, TimelineEntryDto } from '@/lib/dealer-queues/types';
import { errorMessage, fetchJson, queueKeys, sendJson } from '../shared/api';
import { useSharedCopy } from '../shared/copy';
import { AssigneeSelect, DueDateInput, QueueTimeline, RatingStars, RelTime } from '../shared/ui';
import { useAssignedCopy } from './copy';

export function useTaskDetail(id: string | null) {
  return useQuery({
    queryKey: queueKeys.taskDetail(id ?? ''),
    queryFn: ({ signal }) => fetchJson<TaskDetail>(`/api/dealer/queues/tasks/${encodeURIComponent(id ?? '')}`, { signal }),
    enabled: Boolean(id),
  });
}

export type TaskPatchBody = {
  status?: WorkStatus;
  assignedToId?: string | null;
  priority?: TaskPriority;
  dueAt?: string | null;
  note?: string | null;
};

export function useTaskMutations() {
  const qc = useQueryClient();
  const shared = useSharedCopy();
  const patch = async (id: string, body: TaskPatchBody, success?: string) => {
    const detail = await sendJson<TaskDetail>(`/api/dealer/queues/tasks/${encodeURIComponent(id)}`, 'PATCH', body);
    qc.setQueryData(queueKeys.taskDetail(id), detail);
    void qc.invalidateQueries({ queryKey: queueKeys.work });
    if (success) {
      toast.success(success);
      announce(success);
    }
    return detail;
  };
  const safePatch = async (id: string, body: TaskPatchBody, success?: string) => {
    try {
      return await patch(id, body, success);
    } catch (err) {
      toast.error(errorMessage(err, shared.failed));
      return null;
    }
  };
  return { patch, safePatch };
}

function useTaskTimelineLabel() {
  const shared = useSharedCopy();
  return (e: TimelineEntryDto): { title: string; description?: string | null } => {
    const p = e.params ?? {};
    const base = shared.timeline[e.kind] ?? e.label;
    if (e.kind === 'task.status' && p.to) {
      return { title: p.from ? shared.arrow(shared.taskRawStatus[p.from] ?? p.from, shared.taskRawStatus[p.to] ?? p.to) : (shared.taskRawStatus[p.to] ?? p.to) };
    }
    if (e.kind === 'task.priority' && p.to) {
      return { title: `${base}: ${shared.arrow(shared.priority[p.from ?? ''] ?? p.from ?? '—', shared.priority[p.to] ?? p.to)}` };
    }
    if (e.kind === 'task.assigned') return { title: p.toName ? shared.assignedTo(p.toName) : shared.unassignedNow };
    if (e.kind === 'task.created') return { title: base, description: p.source ? (shared.taskSource[p.source] ?? shared.createdBy[p.source] ?? null) : null };
    return { title: base, description: e.note };
  };
}

export function TaskDetailBody({
  id,
  readOnly,
  meId,
  isOwner,
  assignees,
}: {
  id: string;
  readOnly: boolean;
  meId: string;
  isOwner: boolean;
  assignees: AssigneeDto[] | undefined;
}) {
  const copy = useAssignedCopy();
  const q = useTaskDetail(id);
  return (
    <QueryState query={q} skeleton="detail" empty={{ title: copy.notFound, description: null }}>
      {(d) => <Content key={d.id} d={d} readOnly={readOnly} meId={meId} isOwner={isOwner} assignees={assignees} />}
    </QueryState>
  );
}

function Content({
  d,
  readOnly,
  meId,
  isOwner,
  assignees,
}: {
  d: TaskDetail;
  readOnly: boolean;
  meId: string;
  isOwner: boolean;
  assignees: AssigneeDto[] | undefined;
}) {
  const copy = useAssignedCopy();
  const shared = useSharedCopy();
  const { safePatch } = useTaskMutations();
  const labelOf = useTaskTimelineLabel();
  const ids = { assignee: useId(), due: useId(), priority: useId(), note: useId() };
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const mine = d.assignee?.id === meId;
  const canEdit = !readOnly && (isOwner || mine);
  const open = d.status === 'open' || d.status === 'in_progress';

  const run = async (key: string, body: TaskPatchBody, success: string) => {
    setBusy(key);
    await safePatch(d.id, body, success);
    setBusy(null);
  };

  return (
    <div className="space-y-6">
      {canEdit ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={copy.status}>
          {d.allowedTransitions.includes('in_progress') ? (
            <Button variant="outline" className="shadow-none" loading={busy === 'start'} disabled={busy !== null} onClick={() => run('start', { status: 'in_progress' }, copy.started)}>
              <Play aria-hidden className="mr-1.5 h-4 w-4" />
              {copy.start}
            </Button>
          ) : null}
          {d.allowedTransitions.includes('done') ? (
            <Button className="shadow-none" loading={busy === 'done'} disabled={busy !== null} onClick={() => run('done', { status: 'done' }, copy.completed)}>
              <Check aria-hidden className="mr-1.5 h-4 w-4" />
              {copy.complete}
            </Button>
          ) : null}
          {d.allowedTransitions.includes('open') && !open ? (
            <Button variant="outline" className="shadow-none" loading={busy === 'reopen'} disabled={busy !== null} onClick={() => run('reopen', { status: 'open' }, copy.reopened)}>
              <RotateCcw aria-hidden className="mr-1.5 h-4 w-4" />
              {copy.reopen}
            </Button>
          ) : null}
          {d.allowedTransitions.includes('cancelled') ? (
            <Button variant="ghost" loading={busy === 'cancel'} disabled={busy !== null} onClick={() => run('cancel', { status: 'cancelled' }, copy.cancelled)}>
              <Ban aria-hidden className="mr-1.5 h-4 w-4" />
              {copy.cancelTask}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={d.priority} label={shared.priority[d.priority]} />
        <StatusBadge
          tone={d.status === 'done' ? 'success' : d.status === 'cancelled' ? 'neutral' : d.status === 'in_progress' ? 'info' : 'neutral'}
          label={shared.workStatus[d.status]}
          srPrefix={copy.status}
        />
        <span className="qx-caption rounded-chip bg-surface-muted px-1.5 py-0.5 text-fg-muted ring-1 ring-inset ring-border">
          {shared.taskSource[d.sourceKind] ?? d.sourceLabel}
        </span>
        {d.overdue ? <StatusBadge tone="danger" size="sm" label={shared.overdue} /> : null}
      </div>

      <section className="space-y-1.5">
        <h3 className="qx-small font-semibold text-fg">{copy.text}</h3>
        <p className="qx-body whitespace-pre-line break-words text-fg">{d.text}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor={ids.assignee} className="qx-small font-medium text-fg">
            {shared.assignee}
          </label>
          <AssigneeSelect
            id={ids.assignee}
            value={d.assignee?.id ?? null}
            assignees={assignees}
            disabled={!isOwner || readOnly || busy !== null}
            onChange={(v) => void run('assign', { assignedToId: v }, copy.assignedToast)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.due} className="qx-small font-medium text-fg">
            {shared.dueAt}
          </label>
          <DueDateInput id={ids.due} value={d.dueAt} disabled={!canEdit || !open || busy !== null} onChange={(v) => void run('due', { dueAt: v }, copy.dueToast)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.priority} className="qx-small font-medium text-fg">
            {copy.priority}
          </label>
          <select
            id={ids.priority}
            value={d.priority === 'critical' ? 'high' : d.priority}
            disabled={!canEdit || busy !== null}
            onChange={(e) => void run('priority', { priority: e.target.value as TaskPriority }, copy.priorityToast)}
            className="h-11 w-full rounded-control border border-strong bg-surface-1 px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {shared.priority[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {d.feedback ? (
        <section className="space-y-2">
          <h3 className="qx-small font-semibold text-fg">{copy.sourceReview}</h3>
          <div className="rounded-control border border-subtle bg-surface-2 p-3">
            <div className="qx-caption mb-1 flex flex-wrap items-center gap-2 text-fg-muted">
              <RatingStars value={d.feedback.rating} />
              <RelTime iso={d.feedback.createdAt} />
              <Link
                href={d.feedback.href}
                className="ml-auto inline-flex min-h-11 items-center gap-1 text-brand underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {shared.openInInbox}
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              </Link>
            </div>
            {d.feedback.excerpt ? <p className="qx-small text-fg">{d.feedback.excerpt}</p> : null}
          </div>
        </section>
      ) : null}

      {canEdit ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const text = note.trim();
            if (!text) return;
            setBusy('note');
            const ok = await safePatch(d.id, { note: text }, shared.noteSaved);
            if (ok) setNote('');
            setBusy(null);
          }}
        >
          <label htmlFor={ids.note} className="qx-small font-semibold text-fg">
            {shared.addNote}
          </label>
          <textarea
            id={ids.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder={shared.notePlaceholder}
            className="w-full rounded-control border border-strong bg-surface-1 px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex justify-end">
            <Button type="submit" variant="outline" className="shadow-none" disabled={!note.trim() || busy !== null} loading={busy === 'note'}>
              <StickyNote aria-hidden className="mr-1.5 h-4 w-4" />
              {shared.addNote}
            </Button>
          </div>
        </form>
      ) : null}

      <section className="space-y-2">
        <h3 className="qx-small font-semibold text-fg">{shared.timelineTitle}</h3>
        <QueueTimeline entries={d.timeline} labelOf={labelOf} />
      </section>
    </div>
  );
}
