'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { SectionTabs } from '@/components/ds/page';
import { MetricGrid, MetricTile, Timeline } from '@/components/ds/data';
import { QueryState, SectionCard } from '@/components/states';
import { cn } from '@/lib/utils';
import { TASK_STATUSES } from '@/lib/team/constants';
import { formatMinutes } from '@/lib/team/dates';
import { weekKeyLabel } from '@/lib/team-week';
import { qs, teamFetch } from './lib/api';
import { API, useCursorList } from './lib/queries';
import { useWorkspace } from './workspace-context';
import { MemberAvatar, useDisplayName } from './shared';
import type { TaskDto } from './lib/types';
import { useTeamCopy, useTeamLabels } from './copy';

/** Rapor (yönetici): Kişiler · Performans · Akış. Grafikler panodan buraya taşındı (denetim vizyonu). */
export function ReportsView({ tasks }: { tasks: TaskDto[] }) {
  const tu = useTeamCopy().ui;
  const [tab, setTab] = useState('people');
  return (
    <SectionTabs
      value={tab}
      onValueChange={setTab}
      variant="pill"
      ariaLabel={tu.raporBolumleri}
      tabs={[
        { value: 'people', label: tu.kisilerBuGorunum },
        { value: 'performance', label: tu.performans },
        { value: 'activity', label: tu.akis },
      ]}
    >
      {(active) => (active === 'people' ? <PeopleView tasks={tasks} /> : active === 'performance' ? <PerformanceView /> : <ActivityView />)}
    </SectionTabs>
  );
}

/** Kişi başı iş yükü — panodaki (filtreli) görevlerden; durum dağılımı yalnız renge dayanmaz. */
function PeopleView({ tasks }: { tasks: TaskDto[] }) {
  const dn = useDisplayName();
  const tm = useTeamLabels();
  const tf = useTeamCopy().fx;
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { openTask } = useWorkspace();
  const rows = useMemo(() => {
    const map = new Map<string, { user: TaskDto['assignedTo']; counts: Record<string, number>; overdue: number; estimate: number; spent: number; items: TaskDto[] }>();
    for (const t of tasks) {
      const key = t.assignedTo?.id ?? 'none';
      const r = map.get(key) ?? { user: t.assignedTo, counts: { todo: 0, in_progress: 0, review: 0, done: 0 }, overdue: 0, estimate: 0, spent: 0, items: [] };
      r.counts[t.status] = (r.counts[t.status] ?? 0) + 1;
      if (t.overdue) r.overdue++;
      r.estimate += t.estimateMin ?? 0;
      r.spent += t.spentMin;
      r.items.push(t);
      map.set(key, r);
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [tasks]);
  const total = tasks.length || 1;

  if (rows.length === 0) return <p className="qx-small text-fg-muted">{tx.noTasksInView}</p>;
  return (
    <div className="space-y-3">
      <SectionCard title={tu.durumDagilimi} density="compact">
        <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={TASK_STATUSES.map((s) => `${tm.STATUS_META[s].label} ${tasks.filter((t) => t.status === s).length}`).join(', ')}>
          {TASK_STATUSES.map((s) => {
            const n = tasks.filter((t) => t.status === s).length;
            return n ? <span key={s} className={cn('h-full', STATUS_BAR[s])} style={{ width: `${(n / total) * 100}%` }} /> : null;
          })}
        </div>
        <ul className="mt-2 flex flex-wrap gap-3">
          {TASK_STATUSES.map((s) => (
            <li key={s} className="qx-caption flex items-center gap-1.5 text-fg-muted">
              <span aria-hidden className={cn('h-2.5 w-2.5 rounded-sm', STATUS_BAR[s])} /> {tm.STATUS_META[s].label}: <span className="qx-num text-fg">{tasks.filter((t) => t.status === s).length}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <li key={r.user?.id ?? 'none'} className="rounded-card border border-subtle bg-surface-1 p-3">
            <div className="flex items-center gap-2">
              <MemberAvatar user={r.user} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="qx-small truncate font-semibold text-fg">{dn(r.user)}</p>
                <p className="qx-caption text-fg-muted">
                  {tf.peopleRow(r.items.length, formatMinutes(r.spent), formatMinutes(r.estimate))}
                  {r.overdue ? ` · ${r.overdue} geciken` : ''}
                </p>
              </div>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {TASK_STATUSES.map((s) => (
                <li key={s} className="qx-caption rounded-chip bg-surface-2 px-1.5 py-0.5 text-fg-muted">
                  {tm.STATUS_META[s].short}: <span className="qx-num text-fg">{r.counts[s] ?? 0}</span>
                </li>
              ))}
            </ul>
            <ul className="mt-2 space-y-1">
              {r.items
                .filter((t) => t.status !== 'done')
                .slice(0, 4)
                .map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => openTask(t.id)} className={cn('qx-caption w-full truncate text-left hover:underline', t.overdue ? 'text-danger' : 'text-fg')}>
                      {t.title}
                    </button>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_BAR: Record<string, string> = {
  todo: 'bg-fg-subtle',
  in_progress: 'bg-warning',
  review: 'bg-info',
  done: 'bg-success',
};

type PerfRow = {
  id: string;
  name: string | null;
  image: string | null;
  total: number;
  done: number;
  open: number;
  overdue: number;
  completionRate: number | null;
  onTimeRate: number | null;
  estimateMin: number;
  spentMin: number;
  avgCycleHours: number | null;
  avgReviewWaitHours: number | null;
};

/** Performans — seçili haftada biten son N hafta, departman kapsamlı (denetim #73). */
function PerformanceView() {
  const dn = useDisplayName();
  const tv = useTeamCopy().ui2;
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { weekKey, departments } = useWorkspace();
  const [weeks, setWeeks] = useState('4');
  const [dep, setDep] = useState('all');
  const q = useQuery({
    queryKey: ['team', 'performance', weekKey, weeks, dep],
    queryFn: () =>
      teamFetch<{ period: { from: string; to: string; weeks: number }; totals: { total: number; done: number; overdue: number; estimateMin: number; spentMin: number }; members: PerfRow[] }>(
        `${API}/performance${qs({ weekKey, weeks, department: dep === 'all' ? undefined : dep })}`
      ),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={weeks} onValueChange={setWeeks}>
          <SelectTrigger className="h-10 w-40" aria-label={tu.donem}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['1', '2', '4', '8', '12'].map((w) => (
              <SelectItem key={w} value={w}>
                Son {w} hafta
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dep} onValueChange={setDep}>
          <SelectTrigger className="h-10 w-56" aria-label={tu.departman}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tx.allDepartments}</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.slug} value={d.slug}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {q.data && (
          <span className="qx-caption text-fg-muted">
            {weekKeyLabel(q.data.period.from).split(' – ')[0]} – {weekKeyLabel(q.data.period.to).split(' – ')[1]}
          </span>
        )}
      </div>
      <QueryState query={q} skeleton="table" isEmpty={(d) => d.members.length === 0} empty={{ title: tu.ekipteUyeYok }}>
        {(d) => (
          <div className="space-y-3">
            <MetricGrid cols={4}>
              <MetricTile label={tu.gorevler} metric={{ value: d.totals.total }} size="compact" />
              <MetricTile label={tu.biten} metric={{ value: d.totals.done }} tone="success" size="compact" />
              <MetricTile label={tu.acikGeciken} metric={{ value: d.totals.overdue }} tone={d.totals.overdue ? 'danger' : 'neutral'} size="compact" />
              <MetricTile
                label={tu.harcananTahmin}
                metric={{ value: d.totals.estimateMin ? Math.round((d.totals.spentMin / d.totals.estimateMin) * 100) : null, format: 'percent' }}
                hint={`${formatMinutes(d.totals.spentMin)} / ${formatMinutes(d.totals.estimateMin)}`}
                size="compact"
              />
            </MetricGrid>
            <div className="overflow-x-auto rounded-card border border-subtle">
              <table className="w-full min-w-[44rem] text-left">
                <caption className="sr-only">{tx.perfCaption}</caption>
                <thead className="bg-surface-2">
                  <tr className="qx-caption text-fg-muted">
                    <th scope="col" className="px-3 py-2 font-semibold">{tx.person}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{tx.tasks}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{tv.biten}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{tx.onTime}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{tv.geciken}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{tx.avgTime}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{tv.onayBekleme}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Harcanan / tahmin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border-subtle))]">
                  {d.members.map((m) => (
                    <tr key={m.id} className="qx-small">
                      <th scope="row" className="px-3 py-2 font-medium text-fg">
                        <span className="flex items-center gap-2">
                          <MemberAvatar user={m} size="xs" /> {dn(m)}
                        </span>
                      </th>
                      <td className="qx-num px-3 py-2 text-right">{m.total}</td>
                      <td className="qx-num px-3 py-2 text-right">{m.done}</td>
                      <td className="qx-num px-3 py-2 text-right">{m.onTimeRate === null ? '—' : `%${m.onTimeRate}`}</td>
                      <td className={cn('qx-num px-3 py-2 text-right', m.overdue ? 'text-danger' : '')}>{m.overdue}</td>
                      <td className="qx-num px-3 py-2 text-right">{m.avgCycleHours === null ? '—' : `${m.avgCycleHours} sa`}</td>
                      <td className="qx-num px-3 py-2 text-right">{m.avgReviewWaitHours === null ? '—' : `${m.avgReviewWaitHours} sa`}</td>
                      <td className="qx-num px-3 py-2 text-right">
                        {formatMinutes(m.spentMin)} / {formatMinutes(m.estimateMin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="qx-caption text-fg-muted">{tx.onTimeNote}</p>
          </div>
        )}
      </QueryState>
    </div>
  );
}

type ActivityRow = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  actor: { id: string; name: string | null; image: string | null } | null;
  task: { id: string; title: string; status: string } | null;
};

const GROUPS = [
  { value: 'all', label: 'Tümü' },
  { value: 'status', label: 'Durum' },
  { value: 'comment', label: 'Yorum' },
  { value: 'assign', label: 'Atama' },
  { value: 'edit', label: 'Düzenleme' },
  { value: 'file', label: 'Dosya' },
  { value: 'checklist', label: 'Alt görev / süre' },
  { value: 'automation', label: 'Otomasyon' },
  { value: 'system', label: 'Sistem' },
];

/** Akış — kişi ve tür filtresi, "daha fazla yükle" (denetim #72). Odakta yenilenir. */
function ActivityView() {
  const dn = useDisplayName();
  const tv = useTeamCopy().ui2;
  const tf = useTeamCopy().fx;
  const tu = useTeamCopy().ui;
  const { members, openTask } = useWorkspace();
  const [actor, setActor] = useState('all');
  const [group, setGroup] = useState('all');
  const list = useCursorList<ActivityRow>(['team', 'activity', actor, group], (cursor) =>
    `${API}/activity${qs({ actor: actor === 'all' ? undefined : actor, group: group === 'all' ? undefined : group, cursor })}`
  );
  const items = (list.data?.pages ?? []).flatMap((p) => p.items);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={actor} onValueChange={setActor}>
          <SelectTrigger className="h-10 w-52" aria-label={tu.kisi}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tv.herkes}</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {dn(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="h-10 w-52" aria-label={tu.tur}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPS.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {tf.activityGroups[g.value] ?? g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <QueryState query={{ ...list, data: list.data ? { items } : undefined }} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: tu.kayitYok }}>
        {() => (
          <>
            <Timeline
              groupByDay
              ariaLabel={tu.ekipAkisi}
              events={items.map((a) => ({
                id: a.id,
                at: a.createdAt,
                title: (
                  <span>
                    {a.detail ?? a.action}
                    {a.task && (
                      <>
                        {' · '}
                        <button type="button" className="text-brand underline-offset-2 hover:underline" onClick={() => openTask(a.task!.id)}>
                          {a.task.title}
                        </button>
                      </>
                    )}
                  </span>
                ),
                actor: a.actor ? dn(a.actor) : 'Sistem',
                tone: a.action.startsWith('system_') ? 'warning' : a.action === 'automation' ? 'info' : 'neutral',
              }))}
            />
            {list.hasNextPage && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                  {list.isFetchingNextPage ? tu.yukleniyor : tu.dahaFazlaYukle}
                </Button>
              </div>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}
