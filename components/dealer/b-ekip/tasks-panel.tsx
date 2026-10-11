'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { AlertTriangle, Ban, ClipboardList, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmAction, EmptyState } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import type { TaskDto, TeamHub } from '@/lib/staff-ops/types';
import { cn } from '@/lib/utils';
import { fmtDateTime, istanbulLocalToIso, isoToIstanbulLocal, sendJson } from './shared';
import { useTeamCopy } from './copy';
import { FormRow, INPUT_CLS, PersonAvatar, Segmented, TaskStatusBadge, useHubMutation } from './parts';

type Filter = 'open' | 'overdue' | 'done';

export function TasksPanel({ hub, focusUserId }: { hub: TeamHub; focusUserId?: string | null }) {
  const { copy } = useTeamCopy();
  const c = copy.tasks;
  const motion = useMotionPolicy();
  const members = useMemo(() => hub.members.filter((x) => x.isActive), [hub.members]);
  const [filter, setFilter] = useState<Filter>('open');
  const [editing, setEditing] = useState<TaskDto | null>(null);

  const open = hub.tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  const overdue = open.filter((t) => t.overdue);
  const done = hub.tasks.filter((t) => t.status === 'completed' || t.status === 'cancelled');
  const list = filter === 'open' ? open : filter === 'overdue' ? overdue : done;

  if (members.length === 0 && hub.tasks.length === 0) return <EmptyState title={c.noStaff} compact />;

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      {members.length > 0 && <QuickTask members={members} initialAssignee={focusUserId ?? null} />}
      <div className="min-w-0 space-y-3">
        <Segmented<Filter>
          label={copy.hub.tabs.tasks}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: c.filterOpen, count: open.length },
            { value: 'overdue', label: c.filterOverdue, count: overdue.length },
            { value: 'done', label: c.filterDone, count: done.length },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState
            compact
            icon={ClipboardList}
            title={filter === 'done' ? c.emptyDone : c.emptyOpen}
            description={filter === 'done' ? undefined : c.emptyOpenDesc}
          />
        ) : (
          <ul className="space-y-2" aria-label={copy.hub.tabs.tasks}>
            <AnimatePresence initial={false}>
              {list.map((t) => (
                <m.li
                  key={t.id}
                  layout={!motion.reduce}
                  initial={motion.reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={motion.transition({ duration: DURATION.base, ease: EASE.standard })}
                >
                  <TaskRow task={t} onEdit={() => setEditing(t)} />
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing ? <EditTask key={editing.id} task={editing} hub={hub} onClose={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskRow({ task, onEdit }: { task: TaskDto; onEdit: () => void }) {
  const { copy, locale } = useTeamCopy();
  const c = copy.tasks;
  const isOpen = task.status === 'pending' || task.status === 'in_progress';
  const cancel = useHubMutation(() => sendJson(`/api/dealer/staff/tasks/${task.id}`, 'PATCH', { status: 'cancelled' }), { success: c.cancelled });
  const reopen = useHubMutation(() => sendJson(`/api/dealer/staff/tasks/${task.id}`, 'PATCH', { status: 'pending' }), { success: c.reopened });
  return (
    <div className={cn('flex flex-col gap-3 rounded-card border bg-surface-1 p-4 sm:flex-row sm:items-start', task.overdue ? 'border-danger/50' : 'border-subtle')}>
      <PersonAvatar name={task.assignee.name} size="sm" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn('font-medium text-fg', task.status === 'cancelled' && 'line-through text-fg-muted')}>{task.title}</p>
        {task.description && <p className="qx-small line-clamp-2 text-fg-muted">{task.description}</p>}
        <div className="qx-caption flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted">
          <TaskStatusBadge status={task.status} />
          <span>{task.assignee.name ?? copy.common.unknown}</span>
          {task.dueAt && (
            <span className={cn('qx-num inline-flex items-center gap-1', task.overdue && 'font-semibold text-danger')}>
              {task.overdue && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
              {task.overdue ? `${c.overdue} · ` : ''}
              {c.dueAt(fmtDateTime(task.dueAt, locale))}
            </span>
          )}
          {task.completedAt && <span className="qx-num">✓ {fmtDateTime(task.completedAt, locale)}</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        {isOpen ? (
          <>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`${c.editTitle}: ${task.title}`} onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>
            <ConfirmAction
              tone="danger"
              title={`${c.cancel}: ${task.title}`}
              confirmLabel={c.cancel}
              irreversibleNote={false}
              onConfirm={() => cancel.mutateAsync(undefined)}
              trigger={
                <Button variant="ghost" size="icon" className="h-11 w-11 text-danger" aria-label={`${c.cancel}: ${task.title}`}>
                  <Ban className="h-4 w-4" aria-hidden />
                </Button>
              }
            />
          </>
        ) : (
          <Button variant="outline" size="sm" className="min-h-11" disabled={reopen.isPending} onClick={() => reopen.mutate(undefined)}>
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
            {c.reopen}
          </Button>
        )}
      </div>
    </div>
  );
}

function QuickTask({ members, initialAssignee }: { members: TeamHub['members']; initialAssignee: string | null }) {
  const { copy } = useTeamCopy();
  const c = copy.tasks;
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState(initialAssignee && members.some((x) => x.userId === initialAssignee) ? initialAssignee : members[0]?.userId ?? '');
  const [due, setDue] = useState('');
  const [desc, setDesc] = useState('');
  const create = useHubMutation(
    (v: { assignedTo: string; title: string; description?: string; dueAt?: string }) => sendJson('/api/dealer/staff/tasks', 'POST', v),
    {
      success: c.created,
      onSuccess: () => {
        setTitle('');
        setDue('');
        setDesc('');
      },
    }
  );
  return (
    <form
      className="h-fit space-y-3 rounded-card border border-subtle bg-surface-1 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !assignee) return;
        create.mutate({
          assignedTo: assignee,
          title: title.trim(),
          description: desc.trim() || undefined,
          dueAt: due ? istanbulLocalToIso(due) ?? undefined : undefined,
        });
      }}
    >
      <h3 className="qx-h3 text-fg">{c.quickTitle}</h3>
      <FormRow label={copy.training.moduleTitle}>
        {({ id }) => <input id={id} value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} placeholder={c.titlePh} className={INPUT_CLS} />}
      </FormRow>
      <FormRow label={c.assignee}>
        {({ id }) => (
          <select id={id} value={assignee} onChange={(e) => setAssignee(e.target.value)} className={INPUT_CLS}>
            {members.map((mem) => (
              <option key={mem.userId} value={mem.userId}>
                {mem.name ?? mem.email}
                {mem.jobTitle ? ` · ${mem.jobTitle}` : ''}
              </option>
            ))}
          </select>
        )}
      </FormRow>
      <FormRow label={c.due} optional>
        {({ id }) => <input id={id} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={INPUT_CLS} />}
      </FormRow>
      <FormRow label={c.description} optional>
        {({ id }) => (
          <textarea id={id} value={desc} maxLength={2000} rows={3} onChange={(e) => setDesc(e.target.value)} className={cn(INPUT_CLS, 'py-2')} />
        )}
      </FormRow>
      <Button type="submit" className="min-h-11 w-full" disabled={create.isPending || !title.trim()} aria-busy={create.isPending}>
        <ClipboardList className="mr-2 h-4 w-4" aria-hidden />
        {create.isPending ? copy.common.saving : c.create}
      </Button>
    </form>
  );
}

function EditTask({ task, hub, onClose }: { task: TaskDto; hub: TeamHub; onClose: () => void }) {
  const { copy } = useTeamCopy();
  const c = copy.tasks;
  const members = hub.members.filter((x) => x.isActive);
  const [title, setTitle] = useState(task.title);
  const [assignee, setAssignee] = useState(task.assignee.userId);
  const [due, setDue] = useState(isoToIstanbulLocal(task.dueAt));
  const [desc, setDesc] = useState(task.description ?? '');
  const save = useHubMutation((v: Record<string, unknown>) => sendJson(`/api/dealer/staff/tasks/${task.id}`, 'PATCH', v), {
    success: copy.common.saved,
    onSuccess: onClose,
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const patch: Record<string, unknown> = {};
        if (title.trim() && title.trim() !== task.title) patch.title = title.trim();
        if ((desc.trim() || null) !== (task.description ?? null)) patch.description = desc.trim() || null;
        if (due !== isoToIstanbulLocal(task.dueAt)) patch.dueAt = due ? istanbulLocalToIso(due) : null;
        if (assignee !== task.assignee.userId) patch.assignedTo = assignee;
        if (Object.keys(patch).length === 0) return onClose();
        save.mutate(patch);
      }}
    >
      <DialogHeader>
        <DialogTitle>{c.editTitle}</DialogTitle>
      </DialogHeader>
      <FormRow label={copy.training.moduleTitle}>
        {({ id }) => <input id={id} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLS} />}
      </FormRow>
      <FormRow label={c.assignee}>
        {({ id }) => (
          <select id={id} value={assignee} onChange={(e) => setAssignee(e.target.value)} className={INPUT_CLS}>
            {!members.some((x) => x.userId === task.assignee.userId) && <option value={task.assignee.userId}>{task.assignee.name ?? copy.common.unknown}</option>}
            {members.map((mem) => (
              <option key={mem.userId} value={mem.userId}>
                {mem.name ?? mem.email}
              </option>
            ))}
          </select>
        )}
      </FormRow>
      <FormRow label={c.due} optional>
        {({ id }) => <input id={id} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={INPUT_CLS} />}
      </FormRow>
      <FormRow label={c.description} optional>
        {({ id }) => <textarea id={id} value={desc} maxLength={2000} rows={3} onChange={(e) => setDesc(e.target.value)} className={cn(INPUT_CLS, 'py-2')} />}
      </FormRow>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
          {copy.common.cancel}
        </Button>
        <Button type="submit" className="min-h-11" disabled={save.isPending} aria-busy={save.isPending}>
          {save.isPending ? copy.common.saving : copy.common.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
