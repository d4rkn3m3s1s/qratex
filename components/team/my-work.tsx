'use client';

import { useMemo } from 'react';
import { m as Motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Clock3, ListTodo, Undo2 } from 'lucide-react';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { QueryState, SectionCard } from '@/components/states';
import { listContainer, listItem, useMotionPolicy } from '@/lib/motion';
import { effectiveDue } from '@/lib/team/dates';
import { useSummary, useTasks } from './lib/queries';
import { useWorkspace } from './workspace-context';
import { TaskCard } from './board/task-card';
import type { TaskDto } from './lib/types';

/**
 * "Benim işlerim" — üyenin açılış ekranı (denetim Y2/#21, eksik özellik "Bugünüm"): üye artık
 * şirketin tüm panosuyla değil, kendi açık işleriyle karşılaşır. Gruplar: revizyon istenenler,
 * gecikenler, sıradakiler, onayda bekleyenler, bu hafta onaylananlar (tüm haftalardan; biten
 * olmayan iş haftayla birlikte kaybolmaz).
 */
export function MyWork({ onPickTag }: { onPickTag: (tag: string) => void }) {
  const { weekKey, currentWeekKey } = useWorkspace();
  const tasks = useTasks({ view: 'mine', weekKey: currentWeekKey });
  const summary = useSummary(currentWeekKey);
  const policy = useMotionPolicy();

  const buckets = useMemo(() => {
    const items = tasks.data?.items ?? [];
    const byDue = (a: TaskDto, b: TaskDto) =>
      (effectiveDue(a.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY) - (effectiveDue(b.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY);
    const revision = items.filter((t) => t.revisionRequested);
    const overdue = items.filter((t) => !t.revisionRequested && t.status !== 'review' && t.status !== 'done' && t.overdue).sort(byDue);
    const next = items.filter((t) => !t.revisionRequested && !t.overdue && (t.status === 'todo' || t.status === 'in_progress')).sort(byDue);
    const review = items.filter((t) => t.status === 'review');
    const done = items.filter((t) => t.status === 'done');
    return { revision, overdue, next, review, done };
  }, [tasks.data]);

  const groups: Array<{ key: string; title: string; items: TaskDto[]; tone: 'warning' | 'danger' | 'neutral' | 'info' | 'success'; icon: React.ReactNode; hint?: string }> = [
    { key: 'revision', title: 'Revizyon istendi', items: buckets.revision, tone: 'warning', icon: <Undo2 className="h-4 w-4" aria-hidden />, hint: 'Yöneticinin notunu okuyup düzelt, yeniden onaya gönder.' },
    { key: 'overdue', title: 'Gecikenler', items: buckets.overdue, tone: 'danger', icon: <AlertTriangle className="h-4 w-4" aria-hidden /> },
    { key: 'next', title: 'Sıradakiler', items: buckets.next, tone: 'neutral', icon: <ListTodo className="h-4 w-4" aria-hidden /> },
    { key: 'review', title: 'Onayda', items: buckets.review, tone: 'info', icon: <Clock3 className="h-4 w-4" aria-hidden /> },
    { key: 'done', title: 'Bu hafta onaylananlar', items: buckets.done, tone: 'success', icon: <CheckCircle2 className="h-4 w-4" aria-hidden /> },
  ];

  const s = summary.data?.mine;
  return (
    <div className="space-y-4">
      <MetricGrid cols={4}>
        <MetricTile label="Açık işim" metric={{ value: s?.open ?? null }} loading={summary.isLoading} icon={<ListTodo />} size="compact" />
        <MetricTile label="Revizyon istenen" metric={{ value: s?.revision ?? null }} loading={summary.isLoading} icon={<Undo2 />} tone="warning" size="compact" />
        <MetricTile label="Geciken" metric={{ value: s?.overdue ?? null }} loading={summary.isLoading} icon={<AlertTriangle />} tone="danger" size="compact" />
        <MetricTile
          label="Bu hafta onaylanan"
          metric={{ value: s?.approvedThisWeek ?? null }}
          loading={summary.isLoading}
          icon={<CheckCircle2 />}
          tone="success"
          size="compact"
          hint={weekKey === currentWeekKey ? undefined : 'İçinde bulunulan hafta'}
        />
      </MetricGrid>

      <QueryState
        query={tasks}
        skeleton="cards"
        isEmpty={(d) => d.items.length === 0}
        empty={{ variant: 'first-use', title: 'Açık işin yok', description: 'Sana bir görev atandığında burada ve bildirimlerinde göreceksin.' }}
      >
        {() => (
          <div className="space-y-4">
            {groups
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <SectionCard
                  key={g.key}
                  title={
                    <span className="inline-flex items-center gap-2">
                      {g.icon}
                      {g.title} <span className="qx-num font-normal text-fg-muted">{g.items.length}</span>
                    </span>
                  }
                  description={g.hint}
                  tone={g.tone}
                  stripe={g.tone === 'warning' || g.tone === 'danger'}
                  density="compact"
                >
                  <Motion.ul
                    className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                    variants={policy.variants(listContainer)}
                    initial="hidden"
                    animate="visible"
                  >
                    {g.items.map((t) => (
                      <Motion.li key={t.id} variants={policy.variants(listItem)}>
                        <TaskCard task={t} onPickTag={onPickTag} />
                      </Motion.li>
                    ))}
                  </Motion.ul>
                </SectionCard>
              ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
