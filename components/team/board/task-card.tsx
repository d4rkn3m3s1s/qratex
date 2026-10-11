'use client';

import { memo, useState, type DragEvent } from 'react';
import { m as Motion } from 'framer-motion';
import { CheckCircle2, Link2, ListChecks, MessageSquare, Paperclip, Play, RefreshCcw, Send, Timer, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectionCheckbox, StatusBadge } from '@/components/ds/data';
import { cn } from '@/lib/utils';
import { formatMinutes } from '@/lib/team/dates';
import { RECURRENCE_LABEL, STATUS_META, isTaskStatus } from '@/lib/team/constants';
import { canMoveTask, isAssignee } from '@/lib/team/permissions';
import { useWorkspace } from '../workspace-context';
import { useTaskActions } from '../lib/use-task-actions';
import { NoteDialog } from '../note-dialog';
import { DeptChip, DueBadge, MemberAvatar, PriorityBadge, TagChips, displayName } from '../shared';
import { TaskMenu } from './task-menu';
import type { TaskDto } from '../lib/types';
import { useTeamCopy } from '../copy';

type Props = {
  task: TaskDto;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent, task: TaskDto) => void;
  onPickTag?: (tag: string) => void;
  compact?: boolean;
};

/**
 * Görev kartı (ops kaydı: düz yüzey, sonsuz nabız/parıltı yok). Klavyeyle açılır: başlık bir
 * düğmedir (denetim Y7/#78: `div onClick` idi). Birincil adım tek düğme: üye için Başla /
 * Onaya gönder, yönetici için Onayla / Revizyon iste.
 */
export const TaskCard = memo(function TaskCard({ task, selectable, selected, onToggleSelect, draggable, onDragStart, onPickTag, compact }: Props) {
  const tx = useTeamCopy();
  const { teamViewer, can, departments, tags, openTask, weekKey } = useWorkspace();
  const actions = useTaskActions({ onProofRequired: openTask, weekKey });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const done = task.status === 'done';
  const mine = isAssignee(teamViewer, task);
  const mover = canMoveTask(teamViewer, task) && !task.archivedAt;
  const blocked = task.blockedBy && task.blockedBy.status !== 'done';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  let primary: React.ReactNode = null;
  if (mover && !can.approve && mine) {
    if (task.status === 'todo') {
      primary = (
        <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={() => run(() => actions.move(task, 'in_progress'))}>
          <Play className="h-3.5 w-3.5" aria-hidden /> Başla
        </Button>
      );
    } else if (task.status === 'in_progress') {
      primary = (
        <Button size="sm" className="h-9 gap-1.5" disabled={busy} onClick={() => run(() => actions.move(task, 'review'))}>
          <Send className="h-3.5 w-3.5" aria-hidden /> Onaya gönder
        </Button>
      );
    } else if (task.status === 'review') {
      primary = <span className="qx-caption text-info">{tx.awaitingApproval}</span>;
    }
  } else if (can.approve && task.status === 'review' && !task.archivedAt) {
    primary = (
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" className="h-9 gap-1.5" disabled={busy} onClick={() => run(() => actions.move(task, 'done'))}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Onayla
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={() => setRejectOpen(true)}>
          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Revizyon
        </Button>
      </div>
    );
  }

  return (
    <>
    <div draggable={draggable} onDragStart={draggable ? (e) => onDragStart?.(e, task) : undefined}>
    <Motion.article
      layout="position"
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      onClick={() => openTask(task.id)}
      aria-label={task.title}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-2 rounded-card border bg-surface-1 p-3 text-left transition-colors duration-fast ease-standard',
        'hover:border-strong focus-within:border-strong',
        selected ? 'border-brand ring-1 ring-brand' : 'border-subtle',
        task.overdue && !done ? 'border-l-4 border-l-danger' : '',
        done && 'opacity-80'
      )}
    >
      <div className="flex items-start gap-2">
        {selectable && (
          <span className="pt-0.5" data-row-click-ignore onClick={(e) => e.stopPropagation()}>
            <SelectionCheckbox checked={!!selected} onCheckedChange={() => onToggleSelect?.(task.id)} aria-label={`${task.title} seç`} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <PriorityBadge priority={task.priority} hideLow />
            {task.revisionRequested && <StatusBadge label="Revizyon istendi" tone="warning" icon={Undo2} size="sm" />}
            {task.carriedOver && <StatusBadge label={`Devreden · ${task.weekKey?.split('-W')[1] ?? ''}. hafta`} tone="neutral" icon={RefreshCcw} size="sm" />}
            {compact && isTaskStatus(task.status) && <span className="qx-caption text-fg-muted">{STATUS_META[task.status].label}</span>}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openTask(task.id);
            }}
            className={cn(
              'qx-body line-clamp-2 w-full break-words text-left font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
              done && 'line-through decoration-fg-subtle'
            )}
          >
            {task.title}
          </button>
          {!compact && task.description && <p className="qx-small mt-0.5 line-clamp-1 text-fg-muted">{task.description}</p>}
        </div>
        <span className="-mr-1 -mt-1 shrink-0" data-row-click-ignore onClick={(e) => e.stopPropagation()}>
          <TaskMenu task={task} onProofRequired={openTask} />
        </span>
      </div>

      {blocked && (
        <p className="qx-caption flex items-center gap-1 text-warning">
          <Link2 className="h-3 w-3" aria-hidden /> {tx.blockedBy} <span className="truncate">{task.blockedBy!.title}</span>
        </p>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <DueBadge dueAt={task.dueAt} done={done} />
        <DeptChip slug={task.department} departments={departments} />
        {task.recurrence && <StatusBadge label={RECURRENCE_LABEL[task.recurrence] ?? 'Tekrarlı'} tone="neutral" icon={RefreshCcw} size="sm" />}
        <TagChips csv={task.tags} pool={tags} onPick={onPickTag} max={2} />
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <MemberAvatar user={task.assignedTo} size="xs" />
          <span className="qx-caption truncate text-fg-muted">{displayName(task.assignedTo)}</span>
        </div>
        <div className="qx-caption flex shrink-0 items-center gap-2 text-fg-subtle">
          {task._count.checklist > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Alt görev">
              <ListChecks className="h-3 w-3" aria-hidden />
              <span className="qx-num">{task._count.checklist}</span>
              <span className="sr-only">{tx.subtaskSr}</span>
            </span>
          )}
          {task._count.comments > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Yorum">
              <MessageSquare className="h-3 w-3" aria-hidden />
              <span className="qx-num">{task._count.comments}</span>
              <span className="sr-only"> yorum</span>
            </span>
          )}
          {task._count.attachments > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Dosya">
              <Paperclip className="h-3 w-3" aria-hidden />
              <span className="qx-num">{task._count.attachments}</span>
              <span className="sr-only"> dosya</span>
            </span>
          )}
          {(task.estimateMin || task.spentMin > 0) && (
            <span className="inline-flex items-center gap-0.5" title="Harcanan / tahmini süre">
              <Timer className="h-3 w-3" aria-hidden />
              <span className="qx-num">
                {task.spentMin > 0 ? formatMinutes(task.spentMin) : '0'}
                {task.estimateMin ? ` / ${formatMinutes(task.estimateMin)}` : ''}
              </span>
            </span>
          )}
        </div>
      </div>

      {primary && (
        <div className="pt-0.5" data-row-click-ignore onClick={(e) => e.stopPropagation()}>
          {primary}
        </div>
      )}
    </Motion.article>
    </div>

      <NoteDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Revizyon iste"
        description={`"${task.title}" görevi düzeltme için ${displayName(task.assignedTo, 'üyeye')} geri döner.`}
        label="Ne düzeltilmeli?"
        quickNotes={['Kanıt yetersiz', 'Eksik alt görev var', 'Açıklamadaki kapsam karşılanmadı']}
        confirmLabel="Revizyona gönder"
        onConfirm={(note) => actions.move(task, 'in_progress', note)}
      />
    </>
  );
});
