'use client';

import { useMemo } from 'react';
import { RefreshCcw, Undo2 } from 'lucide-react';
import { SelectionCheckbox, StatusBadge } from '@/components/ds/data';
import { PRIORITY_META, STATUS_META, isTaskPriority, isTaskStatus, priorityRank } from '@/lib/team/constants';
import { cn } from '@/lib/utils';
import { useWorkspace } from '../workspace-context';
import { DeptChip, DueBadge, MemberAvatar, PriorityBadge, TagChips, TaskStatusBadge, displayName } from '../shared';
import { TaskMenu } from './task-menu';
import type { TaskDto } from '../lib/types';

export type GroupBy = 'none' | 'status' | 'assignee' | 'priority' | 'department';

type Group = { key: string; label: string; items: TaskDto[]; order: number };

/**
 * Liste görünümü — yoğun satırlar; isteğe bağlı gruplama. Gruplar anlamlı sırada (öncelikte
 * Yüksek önce, durumda iş akışı sırası; denetim Bulgu 30: sayıya göre sıralanıyordu, "Onayda"
 * gri noktaya düşüyordu — artık her durum kendi ikon + etiketini taşır).
 */
export function ListView({
  tasks,
  groupBy,
  selectMode,
  selected,
  onToggleSelect,
  onToggleAll,
  onPickTag,
}: {
  tasks: TaskDto[];
  groupBy: GroupBy;
  selectMode: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
  onPickTag: (tag: string) => void;
}) {
  const { departments, tags, openTask } = useWorkspace();

  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'none') return [{ key: 'all', label: '', items: tasks, order: 0 }];
    const map = new Map<string, Group>();
    for (const t of tasks) {
      let key = 'none';
      let label = 'Diğer';
      let order = 99;
      if (groupBy === 'status') {
        key = t.status;
        label = isTaskStatus(t.status) ? STATUS_META[t.status].label : t.status;
        order = ['todo', 'in_progress', 'review', 'done'].indexOf(t.status);
      } else if (groupBy === 'assignee') {
        key = t.assignedTo?.id ?? 'none';
        label = displayName(t.assignedTo);
        order = t.assignedTo ? 0 : 1;
      } else if (groupBy === 'priority') {
        key = t.priority;
        label = isTaskPriority(t.priority) ? `${PRIORITY_META[t.priority].label} öncelik` : t.priority;
        order = -priorityRank(t.priority);
      } else if (groupBy === 'department') {
        key = t.department ?? 'none';
        const d = departments.find((x) => x.slug === t.department);
        label = d?.name ?? (t.department ? 'Kaldırılmış departman' : 'Departmansız (genel)');
        order = d ? d.order : 999;
      }
      if (!map.has(key)) map.set(key, { key, label, items: [], order });
      map.get(key)!.items.push(t);
    }
    return [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'tr'));
  }, [tasks, groupBy, departments]);

  const allIds = tasks.map((t) => t.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = allIds.some((id) => selected.has(id));

  return (
    <div className="overflow-hidden rounded-card border border-subtle bg-surface-1">
      <div className="hidden items-center gap-3 border-b border-subtle bg-surface-2 px-3 py-2 md:grid md:grid-cols-[auto_minmax(0,1fr)_7.5rem_6.5rem_10rem_9rem_2.75rem]">
        <span className="w-[1.125rem]">
          {selectMode && (
            <SelectionCheckbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={(on) => onToggleAll(allIds, on)}
              aria-label="Tümünü seç"
            />
          )}
        </span>
        <span className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">Görev</span>
        <span className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">Durum</span>
        <span className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">Öncelik</span>
        <span className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">Atanan</span>
        <span className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">Bitiş</span>
        <span className="sr-only">İşlemler</span>
      </div>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label || 'Görevler'}>
          {groupBy !== 'none' && (
            <h3 className="qx-small flex items-center justify-between gap-2 border-b border-subtle bg-surface-2 px-3 py-1.5 font-semibold text-fg">
              <span className="truncate">{g.label}</span>
              <span className="qx-caption qx-num text-fg-muted">{g.items.length}</span>
            </h3>
          )}
          <ul className="divide-y divide-[hsl(var(--border-subtle))]">
            {g.items.map((t) => {
              const done = t.status === 'done';
              return (
                <li
                  key={t.id}
                  className={cn(
                    'relative flex cursor-pointer flex-col gap-2 px-3 py-2.5 transition-colors duration-fast hover:bg-surface-2 md:grid md:grid-cols-[auto_minmax(0,1fr)_7.5rem_6.5rem_10rem_9rem_2.75rem] md:items-center md:gap-3',
                    selected.has(t.id) && 'bg-brand-subtle',
                    t.overdue && !done && 'border-l-4 border-l-danger'
                  )}
                  onClick={() => openTask(t.id)}
                >
                  <span className="hidden w-[1.125rem] md:block" data-row-click-ignore onClick={(e) => e.stopPropagation()}>
                    {selectMode && <SelectionCheckbox checked={selected.has(t.id)} onCheckedChange={() => onToggleSelect(t.id)} aria-label={`${t.title} seç`} />}
                  </span>
                  <div className="flex min-w-0 items-start gap-2 pr-10 md:pr-0">
                    {selectMode && (
                      <span className="pt-0.5 md:hidden" data-row-click-ignore onClick={(e) => e.stopPropagation()}>
                        <SelectionCheckbox checked={selected.has(t.id)} onCheckedChange={() => onToggleSelect(t.id)} aria-label={`${t.title} seç`} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openTask(t.id);
                        }}
                        className={cn('qx-body w-full truncate rounded-sm text-left font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', done && 'line-through decoration-fg-subtle')}
                      >
                        {t.title}
                      </button>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                        {t.revisionRequested && <StatusBadge label="Revizyon istendi" tone="warning" icon={Undo2} size="sm" />}
                        {t.carriedOver && <StatusBadge label="Devreden" tone="neutral" icon={RefreshCcw} size="sm" />}
                        <DeptChip slug={t.department} departments={departments} />
                        <TagChips csv={t.tags} pool={tags} onPick={onPickTag} max={3} />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 md:contents">
                    <span className="md:block">
                      <TaskStatusBadge status={t.status} />
                    </span>
                    <span className="md:block">
                      <PriorityBadge priority={t.priority} />
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <MemberAvatar user={t.assignedTo} size="xs" />
                      <span className="qx-small truncate text-fg-muted">{displayName(t.assignedTo)}</span>
                    </span>
                    <span className="md:block">
                      <DueBadge dueAt={t.dueAt} done={done} />
                    </span>
                  </div>
                  <span className="absolute right-2 top-2 md:static" data-row-click-ignore onClick={(e) => e.stopPropagation()}>
                    <TaskMenu task={t} onProofRequired={openTask} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
