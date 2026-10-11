'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link2, Search, Timer, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ds/a11y';
import { TASK_PRIORITIES, isTaskStatus, type TaskStatus } from '@/lib/team/constants';
import { formatMinutes, formatTeamDate } from '@/lib/team/dates';
import { shiftWeekKey, weekKeyLabel } from '@/lib/team-week';
import { errorMessage, qs, teamFetch } from '../lib/api';
import { API } from '../lib/queries';
import { useTaskActions } from '../lib/use-task-actions';
import { useWorkspace } from '../workspace-context';
import { DeptChip, DueBadge, MemberAvatar, PriorityBadge, TagChips, TaskStatusBadge, useDisplayName } from '../shared';
import type { TaskDetailPayload, TaskList } from '../lib/types';
import { useTeamCopy, useTeamLabels } from '../copy';

function Row({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2 py-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="qx-small text-fg-muted">
          {label}
        </label>
      ) : (
        <span className="qx-small text-fg-muted">{label}</span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Özellik paneli (denetim Bulgu 5/#87: oluşturulan görev hiç düzenlenemiyordu). Yönetici her
 * alanı yerinde değiştirir; her değişiklik tek alanlı istek + geçmişe satır. Üye salt okur;
 * durum ve süre kaydı kendi görevinde açıktır.
 */
export function TaskProperties({ data }: { data: TaskDetailPayload }) {
  const dn = useDisplayName();
  const tm = useTeamLabels();
  const tv = useTeamCopy().ui2;
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { task, can } = data;
  const { members, departments, tags, currentWeekKey, weekKey } = useWorkspace();
  const actions = useTaskActions({ weekKey });
  const ids = { due: useId(), est: useId(), tags: useId(), time: useId() };
  const edit = can.editFields && !task.archivedAt;
  const save = (fields: Record<string, unknown>, msg?: string) => actions.update(task.id, fields, msg);

  const [est, setEst] = useState(task.estimateMin?.toString() ?? '');
  const [tagText, setTagText] = useState(task.tags ?? '');
  const [minutes, setMinutes] = useState('');
  useEffect(() => setEst(task.estimateMin?.toString() ?? ''), [task.estimateMin]);
  useEffect(() => setTagText(task.tags ?? ''), [task.tags]);

  const weeks = Array.from(new Set([task.weekKey, ...[-2, -1, 0, 1, 2, 3, 4].map((o) => shiftWeekKey(currentWeekKey, o))].filter(Boolean) as string[])).sort();
  const assignable = members.filter((m) => m.inTeam || m.isAdmin);
  const statusOptions = [task.status, ...can.moveTargets.filter((s) => !(task.status === 'done'))] as string[];

  const logTime = async () => {
    const n = Number(minutes);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      await actions.act(task.id, { op: 'log_time', minutes: Math.round(n) });
      toast.success(`${formatMinutes(Math.round(n))} eklendi`);
      setMinutes('');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <section aria-label={tu.gorevOzellikleri} className="divide-y divide-[hsl(var(--border-subtle))] rounded-card border border-subtle px-3">
      <Row label={tu.durum}>
        {can.move && !task.archivedAt && statusOptions.length > 1 ? (
          <Select value={task.status} onValueChange={(v) => void actions.move(task, v as TaskStatus)}>
            <SelectTrigger className="h-9 w-full sm:w-52" aria-label={tu.durumuDegistir}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {isTaskStatus(s) ? tm.STATUS_META[s].label : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <TaskStatusBadge status={task.status} size="md" />
        )}
      </Row>
      <Row label={tu.oncelik}>
        {edit ? (
          <Select value={task.priority} onValueChange={(v) => void save({ priority: v })}>
            <SelectTrigger className="h-9 w-full sm:w-52" aria-label={tu.oncelik}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {tm.PRIORITY_META[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <PriorityBadge priority={task.priority} size="md" />
        )}
      </Row>
      <Row label={tu.atanan}>
        {edit ? (
          <Select value={task.assignedToId ?? '__none'} onValueChange={(v) => void save({ assignedToId: v === '__none' ? null : v })}>
            <SelectTrigger className="h-9 w-full sm:w-64" aria-label={tu.atananKisi}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">{tx.unassigned}</SelectItem>
              {assignable.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {dn(m)}
                  {m.isSelf ? ' (sen)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="flex items-center gap-2">
            <MemberAvatar user={task.assignedTo} size="xs" />
            <span className="qx-small text-fg">{dn(task.assignedTo)}</span>
          </span>
        )}
      </Row>
      <Row label={tu.departman}>
        {edit ? (
          <Select value={task.department ?? '__none'} onValueChange={(v) => void save({ department: v === '__none' ? null : v })}>
            <SelectTrigger className="h-9 w-full sm:w-64" aria-label={tu.departman}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">{tx.noDepartmentGeneral}</SelectItem>
              {departments
                .filter((d) => d.isActive || d.slug === task.department)
                .map((d) => (
                  <SelectItem key={d.slug} value={d.slug}>
                    {d.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : task.department ? (
          <DeptChip slug={task.department} departments={departments} />
        ) : (
          <span className="qx-small text-fg-muted">{tv.genel}</span>
        )}
      </Row>
      <Row label={tu.bitis} htmlFor={edit ? ids.due : undefined}>
        {edit ? (
          <div className="flex items-center gap-2">
            <Input
              id={ids.due}
              type="date"
              className="h-9 w-44"
              value={task.dueDay ?? ''}
              onChange={(e) => void save({ dueDate: e.target.value || null })}
            />
            {task.dueDay && <DueBadge dueAt={task.dueAt} done={task.status === 'done'} />}
          </div>
        ) : task.dueAt ? (
          <DueBadge dueAt={task.dueAt} done={task.status === 'done'} size="md" />
        ) : (
          <span className="qx-small text-fg-muted">{tv.yok}</span>
        )}
      </Row>
      <Row label={tu.hafta}>
        {edit ? (
          <Select value={task.weekKey ?? currentWeekKey} onValueChange={(v) => void save({ weekKey: v }, tu.gorevTasindi)}>
            <SelectTrigger className="h-9 w-full sm:w-64" aria-label={tu.hafta}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weeks.map((w) => (
                <SelectItem key={w} value={w}>
                  {weekKeyLabel(w)}
                  {w === currentWeekKey ? ' (bu hafta)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="qx-small text-fg">{task.weekKey ? weekKeyLabel(task.weekKey) : '—'}</span>
        )}
      </Row>
      <Row label={tu.sure} htmlFor={can.logTime ? ids.time : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="qx-small qx-num inline-flex items-center gap-1 text-fg">
            <Timer className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
            {formatMinutes(task.spentMin)}
            {task.estimateMin ? <span className="text-fg-muted"> / {formatMinutes(task.estimateMin)} tahmin</span> : null}
          </span>
          {can.logTime && !task.archivedAt && (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void logTime();
              }}
            >
              <Input
                id={ids.time}
                inputMode="numeric"
                placeholder="dk"
                className="h-9 w-20"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                aria-label={tu.eklenecekDakika}
              />
              <Button type="submit" size="sm" variant="outline" className="h-9" disabled={!minutes}>
                {tu.sureEkle}
              </Button>
            </form>
          )}
        </div>
      </Row>
      {edit && (
        <Row label={tu.tahminDk} htmlFor={ids.est}>
          <Input
            id={ids.est}
            inputMode="numeric"
            className="h-9 w-28"
            value={est}
            onChange={(e) => setEst(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            onBlur={() => {
              const next = est ? Number(est) : null;
              if (next !== task.estimateMin) void save({ estimateMin: next });
            }}
          />
        </Row>
      )}
      <Row label={tu.tekrar}>
        {edit ? (
          <Select value={task.recurrence === 'daily' ? 'weekly' : task.recurrence ?? '__none'} onValueChange={(v) => void save({ recurrence: v === '__none' ? null : v })}>
            <SelectTrigger className="h-9 w-full sm:w-52" aria-label={tu.tekrar}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">{tv.tekrarlanmaz}</SelectItem>
              <SelectItem value="weekly">{tv.herHafta}</SelectItem>
              <SelectItem value="monthly">{tv.herAy}</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className="qx-small text-fg">{task.recurrence ? tm.RECURRENCE_LABEL[task.recurrence] : 'Tekrarlanmaz'}</span>
        )}
      </Row>
      <Row label={tu.etiketler} htmlFor={edit ? ids.tags : undefined}>
        {edit ? (
          <>
            <Input
              id={ids.tags}
              list={`${ids.tags}-pool`}
              className="h-9"
              placeholder={tu.virgulleAyirTasarimAcil}
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              onBlur={() => {
                if ((tagText || '') !== (task.tags ?? '')) void save({ tags: tagText || null });
              }}
            />
            <datalist id={`${ids.tags}-pool`}>
              {tags.map((t) => (
                <option key={t.slug} value={t.label} />
              ))}
            </datalist>
          </>
        ) : task.tags ? (
          <TagChips csv={task.tags} pool={tags} max={8} />
        ) : (
          <span className="qx-small text-fg-muted">{tv.yok}</span>
        )}
      </Row>
      <Row label={tu.bagimlilik}>
        <DependencyField data={data} editable={edit} />
      </Row>
      {task.source && (
        <Row label={tu.kaynak}>
          <span className="qx-small text-fg">{task.source.label}</span>
        </Row>
      )}
      <Row label={tu.olusturan}>
        <span className="qx-small text-fg-muted">
          {task.createdBy?.name ?? tu.silinmisKullanici} · {formatTeamDate(task.createdAt)}
        </span>
      </Row>
    </section>
  );
}

function DependencyField({ data, editable }: { data: TaskDetailPayload; editable: boolean }) {
  const tv = useTeamCopy().ui2;
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { task } = data;
  const { weekKey } = useWorkspace();
  const actions = useTaskActions({ weekKey });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const search = useQuery({
    queryKey: ['team', 'dep-search', debounced],
    queryFn: () => teamFetch<TaskList>(`${API}/tasks${qs({ view: 'search', q: debounced })}`),
    enabled: open && debounced.length >= 2,
  });
  const candidates = (search.data?.items ?? []).filter((t) => t.id !== task.id);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {task.blockedBy ? (
        <span className="qx-small inline-flex min-w-0 items-center gap-1.5 text-fg">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
          <span className="truncate">{task.blockedBy.title}</span>
          <TaskStatusBadge status={task.blockedBy.status} />
        </span>
      ) : (
        <span className="qx-small text-fg-muted">{tv.yok}</span>
      )}
      {editable && task.blockedBy && (
        <IconButton aria-label={tu.bagimliligiKaldir} icon={<X />} size="sm" onClick={() => void actions.update(task.id, { blockedById: null }, tu.bagimlilikKaldirildi)} />
      )}
      {editable && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-9 gap-1.5">
              <Search className="h-3.5 w-3.5" aria-hidden /> {task.blockedBy ? tu.degistir : tu.bagla}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-2" align="start">
            <Input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tu.gorevAraEnAz} aria-label={tu.baglanacakGoreviAra} />
            <ul className="max-h-64 space-y-1 overflow-y-auto" aria-live="polite">
              {debounced.length < 2 && <li className="qx-caption px-1 text-fg-muted">{tx.searchesAllWeeks}</li>}
              {search.isFetching && <li className="qx-caption px-1 text-fg-muted">{tx.searching}</li>}
              {search.isError && <li className="qx-caption px-1 text-danger">{errorMessage(search.error)}</li>}
              {debounced.length >= 2 && !search.isFetching && candidates.length === 0 && !search.isError && (
                <li className="qx-caption px-1 text-fg-muted">{tx.noResults}</li>
              )}
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-control px-2 py-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={async () => {
                      const ok = await actions.update(task.id, { blockedById: c.id }, tu.bagimlilikEklendi);
                      if (ok) setOpen(false);
                    }}
                  >
                    <span className="qx-small truncate">{c.title}</span>
                    <TaskStatusBadge status={c.status} />
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
