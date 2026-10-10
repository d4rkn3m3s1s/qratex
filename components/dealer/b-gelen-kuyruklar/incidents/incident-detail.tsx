'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Hand, ListPlus, PlayCircle, RotateCcw, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, SeverityBadge, StatusBadge } from '@/components/ds/data';
import { announce } from '@/components/ds/a11y';
import { InlineError, QueryState } from '@/components/states';
import { INCIDENT_SEVERITIES, incidentTypeDef, type IncidentSeverity, type IncidentStatus, type RootCause } from '@/lib/dealer-queues/incident-catalog';
import type { AssigneeDto, IncidentDetail, TimelineEntryDto } from '@/lib/dealer-queues/types';
import { errorMessage, fetchJson, queueKeys, sendJson } from '../shared/api';
import { useQueueLocale, useSharedCopy } from '../shared/copy';
import { formatDateTime, formatNumber } from '../shared/format';
import { AssigneeSelect, DueDateInput, QueueTimeline, RatingStars, RelTime } from '../shared/ui';
import { TaskDialog } from '../shared/task-dialog';
import { useIncidentCopy } from './copy';
import { ResolveDialog } from './resolve-dialog';

export function useIncidentDetail(id: string | null) {
  return useQuery({
    queryKey: queueKeys.incidentDetail(id ?? ''),
    queryFn: ({ signal }) => fetchJson<IncidentDetail>(`/api/dealer/queues/incidents/${encodeURIComponent(id ?? '')}`, { signal }),
    enabled: Boolean(id),
  });
}

export type IncidentPatchBody = {
  status?: IncidentStatus;
  assignedToId?: string | null;
  severity?: IncidentSeverity;
  dueAt?: string | null;
  resolutionNote?: string | null;
  rootCause?: RootCause | null;
  note?: string | null;
};

/** Vaka güncelleme kancası: önbelleği (detay + listeler + Bana atananlar) tutarlı günceller. */
export function useIncidentMutations() {
  const qc = useQueryClient();
  const shared = useSharedCopy();
  const patch = async (id: string, body: IncidentPatchBody, success?: string) => {
    const detail = await sendJson<IncidentDetail>(`/api/dealer/queues/incidents/${encodeURIComponent(id)}`, 'PATCH', body);
    qc.setQueryData(queueKeys.incidentDetail(id), detail);
    void qc.invalidateQueries({ queryKey: queueKeys.incidents });
    void qc.invalidateQueries({ queryKey: queueKeys.work });
    void qc.invalidateQueries({ queryKey: queueKeys.radar });
    if (success) {
      toast.success(success);
      announce(success);
    }
    return detail;
  };
  const safePatch = async (id: string, body: IncidentPatchBody, success?: string) => {
    try {
      return await patch(id, body, success);
    } catch (err) {
      toast.error(errorMessage(err, shared.failed));
      return null;
    }
  };
  return { patch, safePatch };
}

function useTimelineLabel() {
  const shared = useSharedCopy();
  return (e: TimelineEntryDto): { title: string; description?: string | null } => {
    const p = e.params ?? {};
    const base = shared.timeline[e.kind] ?? e.label;
    if ((e.kind === 'incident.status' || e.kind === 'task.status') && p.to) {
      const map = e.kind === 'incident.status' ? shared.incidentStatus : shared.taskRawStatus;
      return { title: p.from ? shared.arrow(map[p.from] ?? p.from, map[p.to] ?? p.to) : (map[p.to] ?? p.to), description: e.note };
    }
    if (e.kind === 'incident.severity' && p.to) {
      return { title: `${base}: ${shared.arrow(shared.severity[p.from ?? ''] ?? p.from ?? '—', shared.severity[p.to] ?? p.to)}` };
    }
    if (e.kind.endsWith('.assigned')) return { title: p.toName ? shared.assignedTo(p.toName) : shared.unassignedNow };
    if (e.kind === 'incident.resolved') {
      return { title: base, description: [e.note, p.rootCause ? shared.rootCause[p.rootCause] : null].filter(Boolean).join(' · ') || null };
    }
    if (e.kind === 'incident.created' || e.kind === 'task.created') {
      return { title: base, description: p.source ? (shared.createdBy[p.source] ?? null) : null };
    }
    return { title: base, description: e.note };
  };
}

export function IncidentDetailBody({
  id,
  readOnly,
  meId,
  isOwner,
  assignees,
}: {
  id: string;
  readOnly: boolean;
  meId: string;
  /** İşletme sahibi mi (personel atama/önem değiştiremez). */
  isOwner: boolean;
  assignees: AssigneeDto[] | undefined;
}) {
  const copy = useIncidentCopy();
  const q = useIncidentDetail(id);
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
  d: IncidentDetail;
  readOnly: boolean;
  meId: string;
  isOwner: boolean;
  assignees: AssigneeDto[] | undefined;
}) {
  const copy = useIncidentCopy();
  const shared = useSharedCopy();
  const locale = useQueueLocale();
  const qc = useQueryClient();
  const { safePatch, patch } = useIncidentMutations();
  const labelOf = useTimelineLabel();
  const ids = { assignee: useId(), due: useId(), severity: useId(), note: useId() };
  const [resolveOpen, setResolveOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const def = incidentTypeDef(d.type);
  const open = d.status !== 'resolved';
  const mine = d.assignee?.id === meId;
  const canEdit = !readOnly && (isOwner || mine);

  const run = async (key: string, body: IncidentPatchBody, success: string) => {
    setBusy(key);
    await safePatch(d.id, body, success);
    setBusy(null);
  };

  const m = d.metrics;
  const fmt1 = (v: number | null | undefined) => (v == null ? null : formatNumber(v, locale, 1));

  return (
    <div className="space-y-6">
      {!readOnly ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={copy.manage}>
          {open && !mine ? (
            <Button
              variant="outline"
              className="shadow-none"
              loading={busy === 'claim'}
              disabled={busy !== null || (!isOwner && d.assignee !== null)}
              onClick={() => run('claim', { assignedToId: meId, status: 'in_progress' }, copy.claimed)}
            >
              <Hand aria-hidden className="mr-1.5 h-4 w-4" />
              {copy.claim}
            </Button>
          ) : null}
          {open && canEdit && d.status !== 'in_progress' && d.allowedTransitions.includes('in_progress') ? (
            <Button variant="outline" className="shadow-none" loading={busy === 'start'} disabled={busy !== null} onClick={() => run('start', { status: 'in_progress' }, copy.started)}>
              <PlayCircle aria-hidden className="mr-1.5 h-4 w-4" />
              {copy.start}
            </Button>
          ) : null}
          {open && canEdit ? (
            <Button className="shadow-none" disabled={busy !== null} onClick={() => setResolveOpen(true)}>
              <CheckCircle2 aria-hidden className="mr-1.5 h-4 w-4" />
              {copy.resolve}
            </Button>
          ) : null}
          {!open && canEdit ? (
            <Button variant="outline" className="shadow-none" loading={busy === 'reopen'} disabled={busy !== null} onClick={() => run('reopen', { status: 'open' }, copy.reopened)}>
              <RotateCcw aria-hidden className="mr-1.5 h-4 w-4" />
              {copy.reopen}
            </Button>
          ) : null}
          {isOwner ? (
            <Button variant="ghost" disabled={busy !== null} onClick={() => setTaskOpen(true)}>
              <ListPlus aria-hidden className="mr-1.5 h-4 w-4" />
              {copy.createTask}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={d.severity} emphasize={d.severity === 'critical' && open} />
        <StatusBadge tone={d.status === 'resolved' ? 'success' : d.status === 'in_progress' ? 'info' : 'neutral'} label={shared.incidentStatus[d.status]} srPrefix={copy.status} />
        <span className="qx-caption rounded-chip bg-surface-muted px-1.5 py-0.5 text-fg-muted ring-1 ring-inset ring-border">
          {shared.group[d.typeGroup]} · {def.label[locale]}
        </span>
        {d.overdue ? <StatusBadge tone="danger" label={shared.overdue} size="sm" /> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
          <label htmlFor={ids.severity} className="qx-small font-medium text-fg">
            {copy.severityField}
          </label>
          <select
            id={ids.severity}
            value={d.severity}
            disabled={!isOwner || readOnly || busy !== null}
            onChange={(e) => void run('severity', { severity: e.target.value as IncidentSeverity }, copy.severityToast)}
            className="h-11 w-full rounded-control border border-strong bg-surface-1 px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {shared.severity[s]}
              </option>
            ))}
          </select>
        </div>
        <KeyValueList
          layout="stacked"
          dense
          items={[
            { label: copy.opened, value: <span title={formatDateTime(d.createdAt, locale)}><RelTime iso={d.createdAt} /></span> },
            { label: copy.resolvedAt, value: d.resolvedAt ? <RelTime iso={d.resolvedAt} /> : null, hidden: !d.resolvedAt },
          ]}
        />
      </div>

      {d.description ? (
        <section className="space-y-1.5">
          <h3 className="qx-small font-semibold text-fg">{copy.description}</h3>
          <p className="qx-body whitespace-pre-line break-words text-fg">{d.description}</p>
        </section>
      ) : null}

      {m ? (
        <section className="space-y-1.5">
          <h3 className="qx-small font-semibold text-fg">{copy.metricsTitle}</h3>
          <KeyValueList
            layout="grid"
            columns={2}
            items={[
              { label: copy.metricValue, value: m.value == null ? null : formatNumber(m.value, locale, 1) },
              { label: copy.metricThreshold, value: m.threshold == null ? null : formatNumber(m.threshold, locale, 1) },
              { label: copy.metricLast7, value: fmt1(m.avgLast7), hidden: m.avgLast7 === undefined },
              { label: copy.metricPrev7, value: fmt1(m.avgPrev7), hidden: m.avgPrev7 === undefined },
            ]}
          />
        </section>
      ) : null}

      {d.table ? (
        <section className="space-y-1.5">
          <h3 className="qx-small font-semibold text-fg">{copy.tableTitle}</h3>
          <p className="qx-body text-fg">
            {d.table.label}
            {d.table.requestType ? ` · ${shared.tableRequest[d.table.requestType] ?? d.table.requestType}` : ''}
          </p>
          {d.table.reasons.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label={copy.tableReasons}>
              {d.table.reasons.map((r) => (
                <li key={r} className="qx-caption rounded-chip bg-warning-subtle px-2 py-0.5 text-warning ring-1 ring-inset ring-warning-border">
                  {shared.tableReason[r] ?? r}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {d.feedbacks.length ? (
        <section className="space-y-2">
          <h3 className="qx-small font-semibold text-fg">{copy.relatedReviews}</h3>
          <ul className="space-y-2">
            {d.feedbacks.map((f) => (
              <li key={f.id} className="rounded-control border border-subtle bg-surface-2 p-3">
                <div className="qx-caption mb-1 flex flex-wrap items-center gap-2 text-fg-muted">
                  <RatingStars value={f.rating} />
                  <RelTime iso={f.createdAt} />
                  <StatusBadge size="sm" tone={f.replied ? 'success' : 'warning'} label={f.replied ? copy.replied : copy.notReplied} />
                  <Link
                    href={f.href}
                    className="ml-auto inline-flex min-h-11 items-center gap-1 text-brand underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {shared.openInInbox}
                    <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                </div>
                {f.excerpt ? <p className="qx-small text-fg">{f.excerpt}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {d.tasks.length ? (
        <section className="space-y-2">
          <h3 className="qx-small font-semibold text-fg">{copy.tasksTitle}</h3>
          <ul className="space-y-1.5">
            {d.tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-control border border-subtle px-3 py-2">
                <Link
                  href={`/dealer/inbox/assigned?id=task-${t.id}`}
                  className="qx-small min-w-0 truncate text-fg underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t.title}
                </Link>
                <StatusBadge size="sm" tone={t.status === 'done' ? 'success' : 'neutral'} label={shared.taskRawStatus[t.status] ?? t.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {d.resolution && (d.resolution.note || d.resolution.rootCause) ? (
        <section className="space-y-1.5">
          <h3 className="qx-small font-semibold text-fg">{copy.resolution}</h3>
          {d.resolution.note ? <p className="qx-body whitespace-pre-line text-fg">{d.resolution.note}</p> : null}
          {d.resolution.rootCause ? <StatusBadge size="sm" tone="info" label={shared.rootCause[d.resolution.rootCause] ?? d.resolution.rootCause} /> : null}
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
      ) : !readOnly && !isOwner ? (
        <InlineError tone="info">{copy.staffOnly}</InlineError>
      ) : null}

      <section className="space-y-2">
        <h3 className="qx-small font-semibold text-fg">{shared.timelineTitle}</h3>
        <QueueTimeline entries={d.timeline} labelOf={labelOf} />
      </section>

      <ResolveDialog
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        incident={{ id: d.id, type: d.type, title: d.title }}
        onConfirm={(input) => patch(d.id, { status: 'resolved', ...input }, copy.resolved)}
      />
      <TaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        title={copy.createTaskTitle}
        description={copy.createTaskBody}
        submitLabel={copy.createTask}
        textLabel={copy.taskText}
        defaultText={d.title}
        showPriority={false}
        assignees={assignees}
        onSubmit={async (p) => {
          const detail = await sendJson<IncidentDetail>(`/api/dealer/queues/incidents/${encodeURIComponent(d.id)}/tasks`, 'POST', {
            text: p.text,
            assignedToId: p.assignedToId,
            dueAt: p.dueAt,
          });
          qc.setQueryData(queueKeys.incidentDetail(d.id), detail);
          void qc.invalidateQueries({ queryKey: queueKeys.work });
          toast.success(copy.taskCreated);
          announce(copy.taskCreated);
        }}
      />
    </div>
  );
}
