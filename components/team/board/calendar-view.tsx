'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { istanbulDayOf, shortDayLabel } from '@/lib/team/dates';
import { STATUS_META, isTaskStatus } from '@/lib/team/constants';
import { weekDays } from '@/lib/team-week';
import { useWorkspace } from '../workspace-context';
import { useTaskActions } from '../lib/use-task-actions';
import { STATUS_ICON, PriorityBadge, MemberAvatar } from '../shared';
import type { TaskDto } from '../lib/types';

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/**
 * Takvim — haftanın 7 günü İstanbul takvimine göre (denetim Bulgu 70: "bugün" UTC idi).
 * Yönetici masaüstünde görevi başka güne sürükleyerek yeniden planlar; aynı iş detay
 * panelindeki tarih alanıyla klavyeyle de yapılır.
 */
export function CalendarView({ tasks }: { tasks: TaskDto[] }) {
  const { weekKey, can, openTask } = useWorkspace();
  const actions = useTaskActions({ weekKey });
  const days = useMemo(() => weekDays(weekKey), [weekKey]);
  const today = istanbulDayOf(new Date());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, TaskDto[]>(days.map((d) => [d, []]));
    const undated: TaskDto[] = [];
    const outside: TaskDto[] = [];
    for (const t of tasks) {
      if (!t.dueDay) undated.push(t);
      else if (map.has(t.dueDay)) map.get(t.dueDay)!.push(t);
      else outside.push(t);
    }
    return { map, undated, outside };
  }, [tasks, days]);

  const renderItem = (t: TaskDto) => {
    const Icon = STATUS_ICON[t.status];
    return (
      <li key={t.id}>
        <button
          type="button"
          draggable={can.editAnyTask}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', t.id);
            setDragId(t.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOverDay(null);
          }}
          onClick={() => openTask(t.id)}
          className={cn(
            'flex w-full items-start gap-1.5 rounded-control border bg-surface-1 px-2 py-1.5 text-left transition-colors duration-fast hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            t.overdue ? 'border-danger-border' : 'border-subtle',
            t.status === 'done' && 'opacity-70'
          )}
        >
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
          <span className="sr-only">{isTaskStatus(t.status) ? STATUS_META[t.status].label : ''}: </span>
          <span className="min-w-0 flex-1">
            <span className={cn('qx-small line-clamp-2 font-medium text-fg', t.status === 'done' && 'line-through')}>{t.title}</span>
            <span className="mt-1 flex items-center gap-1">
              <PriorityBadge priority={t.priority} hideLow />
              <MemberAvatar user={t.assignedTo} size="xs" />
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((d, i) => {
          const items = byDay.map.get(d) ?? [];
          const isToday = d === today;
          return (
            <section
              key={d}
              aria-label={`${DAY_NAMES[i]} ${shortDayLabel(d)}${isToday ? ', bugün' : ''}`}
              className={cn(
                'flex min-h-[8rem] flex-col rounded-card border p-2',
                isToday ? 'border-brand bg-brand-subtle/40' : 'border-subtle bg-surface-2/60',
                overDay === d && 'ring-2 ring-brand'
              )}
              onDragOver={(e) => {
                if (!can.editAnyTask || !dragId) return;
                e.preventDefault();
                setOverDay(d);
              }}
              onDragLeave={() => setOverDay((cur) => (cur === d ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId;
                setDragId(null);
                setOverDay(null);
                if (id) void actions.update(id, { dueDate: d }, `Bitiş tarihi ${shortDayLabel(d)} yapıldı`);
              }}
            >
              <header className="mb-1.5 flex items-baseline justify-between px-0.5">
                <span className={cn('qx-small font-semibold', isToday ? 'text-brand' : 'text-fg')}>
                  {DAY_NAMES[i]} <span className="qx-num font-normal text-fg-muted">{shortDayLabel(d)}</span>
                </span>
                {isToday && <span className="qx-caption text-brand">Bugün</span>}
              </header>
              <ul className="flex flex-col gap-1.5">
                {items.map(renderItem)}
              </ul>
            </section>
          );
        })}
      </div>
      {(byDay.undated.length > 0 || byDay.outside.length > 0) && (
        <div className="grid gap-2 md:grid-cols-2">
          {byDay.undated.length > 0 && (
            <section aria-label="Bitiş tarihi olmayanlar" className="rounded-card border border-dashed border-subtle p-2">
              <h3 className="qx-small mb-1.5 px-0.5 font-semibold text-fg-muted">Tarihsiz ({byDay.undated.length})</h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {byDay.undated.map(renderItem)}
              </ul>
            </section>
          )}
          {byDay.outside.length > 0 && (
            <section aria-label="Bu hafta dışında bitenler" className="rounded-card border border-dashed border-subtle p-2">
              <h3 className="qx-small mb-1.5 px-0.5 font-semibold text-fg-muted">Bitişi bu hafta dışında ({byDay.outside.length})</h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {byDay.outside.map(renderItem)}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
