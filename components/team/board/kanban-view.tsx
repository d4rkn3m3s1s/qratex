'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { TASK_STATUSES, STATUS_META, type TaskStatus } from '@/lib/team/constants';
import { checkTransition, canMoveTask } from '@/lib/team/permissions';
import { cn } from '@/lib/utils';
import { useWorkspace } from '../workspace-context';
import { useTaskActions } from '../lib/use-task-actions';
import { STATUS_ICON } from '../shared';
import { TaskCard } from './task-card';
import type { TaskDto } from '../lib/types';

/**
 * Kanban — 4 kolon (Yapılacak · Devam · Onayda · Bitti). Masaüstünde sürükle-bırak; aynı geçiş
 * her ekranda kart menüsündeki "Taşı" ile klavyeyle de yapılır. Mobilde kolonlar yatay
 * kaydırılır (snap). Bırakma hedefi yalnız izinli geçişlerde vurgulanır.
 */
export function KanbanView({
  tasks,
  selectMode,
  selected,
  onToggleSelect,
  onPickTag,
}: {
  tasks: TaskDto[];
  selectMode: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onPickTag: (tag: string) => void;
}) {
  const { teamViewer, openTask, weekKey } = useWorkspace();
  const actions = useTaskActions({ onProofRequired: openTask, weekKey });
  const [dragTask, setDragTask] = useState<TaskDto | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  const byCol = useMemo(() => {
    const map: Record<TaskStatus, TaskDto[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of tasks) (map[t.status as TaskStatus] ?? map.todo).push(t);
    return map;
  }, [tasks]);

  const canDrop = (to: TaskStatus) => {
    if (!dragTask) return false;
    if (dragTask.status === to || dragTask.status === 'done') return false;
    return checkTransition(dragTask.status as TaskStatus, to, teamViewer.isManager ? 'manager' : 'member').ok;
  };

  const onDragStart = (e: DragEvent, task: TaskDto) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    setDragTask(task);
  };

  return (
    <div
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible"
      onDragEnd={() => {
        setDragTask(null);
        setOver(null);
      }}
    >
      {TASK_STATUSES.map((col) => {
        const Icon = STATUS_ICON[col];
        const items = byCol[col];
        const droppable = canDrop(col);
        return (
          <section
            key={col}
            aria-labelledby={`col-${col}`}
            className={cn(
              'flex w-[85vw] max-w-[22rem] shrink-0 snap-start flex-col rounded-card border bg-surface-2/60 p-2 sm:w-[20rem] lg:w-auto lg:max-w-none',
              over === col && droppable ? 'border-brand bg-brand-subtle/40' : 'border-subtle'
            )}
            onDragOver={(e) => {
              if (!droppable) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (over !== col) setOver(col);
            }}
            onDragLeave={() => setOver((cur) => (cur === col ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              const t = dragTask;
              setOver(null);
              setDragTask(null);
              if (t && droppable) void actions.move(t, col);
            }}
          >
            <header className="flex items-center justify-between gap-2 px-1.5 pb-2 pt-1">
              <h3 id={`col-${col}`} className="qx-small flex items-center gap-1.5 font-semibold text-fg">
                <Icon className="h-4 w-4 text-fg-muted" aria-hidden />
                {STATUS_META[col].label}
              </h3>
              <span className="qx-caption qx-num rounded-chip bg-surface-1 px-1.5 py-0.5 text-fg-muted" aria-label={`${items.length} görev`}>
                {items.length}
              </span>
            </header>
            <div className="flex min-h-[6rem] flex-col gap-2">
              {items.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  selectable={selectMode}
                  selected={selected.has(t.id)}
                  onToggleSelect={onToggleSelect}
                  draggable={!selectMode && canMoveTask(teamViewer, t) && t.status !== 'done'}
                  onDragStart={onDragStart}
                  onPickTag={onPickTag}
                />
              ))}
              {items.length === 0 && (
                <p className="qx-small rounded-control border border-dashed border-subtle px-3 py-6 text-center text-fg-subtle">
                  {droppable ? 'Buraya bırak' : col === 'review' ? 'Onay bekleyen görev yok' : col === 'done' ? 'Henüz biten görev yok' : 'Görev yok'}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
