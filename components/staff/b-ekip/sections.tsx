'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, BookOpen, Check, CheckCircle2, ClipboardList, ListChecks, Loader2, MessageSquareQuote, Play, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SectionCard, StatusBadge } from '@/components/ds';
import { ConfirmAction, EmptyState, ErrorState } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { STAFF_TODAY_QUERY_KEY, type StaffChecklistDto, type StaffToday, type TaskDto } from '@/lib/staff-ops/types';
import { cn } from '@/lib/utils';
import { addDays, fmtDateTime, fmtDay, fmtRelative, fmtTime, sendJson, teamFetch } from '@/components/dealer/b-ekip/shared';
import { useTeamCopy } from '@/components/dealer/b-ekip/copy';
import { FieldStatusBadge, LeaveStatusBadge, TaskStatusBadge } from '@/components/dealer/b-ekip/parts';
import { useStaffCopy } from './copy';

function useTodayMutation<V>(fn: (v: V) => Promise<unknown>, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (success) toast.success(success);
      void qc.invalidateQueries({ queryKey: [STAFF_TODAY_QUERY_KEY] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });
}

// ───────────────────────────── Görevler ─────────────────────────────

export function TasksSection({ data }: { data: StaffToday }) {
  const { s } = useStaffCopy();
  const c = s.tasks;
  const motion = useMotionPolicy();
  return (
    <SectionCard title={c.title} icon={<ClipboardList className="h-4 w-4" aria-hidden />} density="compact">
      {data.openTasks.length === 0 ? (
        <EmptyState compact icon={CheckCircle2} title={c.empty} description={c.emptyDesc} />
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {data.openTasks.map((t) => (
              <m.li
                key={t.id}
                layout={!motion.reduce}
                initial={motion.reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={motion.reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginTop: 0 }}
                transition={motion.transition({ duration: DURATION.base, ease: EASE.standard })}
              >
                <TaskItem task={t} />
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </SectionCard>
  );
}

function TaskItem({ task }: { task: TaskDto }) {
  const { s, locale } = useStaffCopy();
  const c = s.tasks;
  const qc = useQueryClient();
  const move = useMutation({
    mutationFn: (status: 'in_progress' | 'completed' | 'reopen') => sendJson(`/api/staff/tasks?id=${encodeURIComponent(task.id)}`, 'PATCH', { status }),
    onSuccess: (_r, status) => {
      void qc.invalidateQueries({ queryKey: [STAFF_TODAY_QUERY_KEY] });
      if (status === 'completed') {
        toast.success(c.completed, {
          duration: 8000,
          action: {
            label: c.undo,
            onClick: () => {
              void sendJson(`/api/staff/tasks?id=${encodeURIComponent(task.id)}`, 'PATCH', { status: 'reopen' })
                .then(() => {
                  toast.success(c.undone);
                  void qc.invalidateQueries({ queryKey: [STAFF_TODAY_QUERY_KEY] });
                })
                .catch((err: Error) => toast.error(err.message));
            },
          },
        });
      } else if (status === 'in_progress') toast.success(c.started);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });
  const busy = move.isPending;
  return (
    <div className={cn('flex flex-col gap-3 rounded-control border bg-surface-1 p-3 sm:flex-row sm:items-center', task.overdue ? 'border-danger/60' : 'border-subtle')}>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-fg">{task.title}</p>
        {task.description && <p className="qx-small whitespace-pre-line text-fg-muted">{task.description}</p>}
        <div className="qx-caption flex flex-wrap items-center gap-2 text-fg-muted">
          <TaskStatusBadge status={task.status} />
          {task.dueAt && (
            <span className={cn('qx-num inline-flex items-center gap-1', task.overdue && 'font-semibold text-danger')}>
              {task.overdue && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
              {task.overdue ? `${c.overdue} · ` : ''}
              {c.due(fmtDateTime(task.dueAt, locale))}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {task.status === 'pending' && (
          <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" disabled={busy} aria-busy={busy && move.variables === 'in_progress'} onClick={() => move.mutate('in_progress')}>
            {busy && move.variables === 'in_progress' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Play className="mr-1.5 h-4 w-4" aria-hidden />}
            {c.start}
          </Button>
        )}
        <Button className="min-h-11 flex-1 sm:flex-none" disabled={busy} aria-busy={busy && move.variables === 'completed'} onClick={() => move.mutate('completed')}>
          {busy && move.variables === 'completed' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Check className="mr-1.5 h-4 w-4" aria-hidden />}
          {c.complete}
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────── Bana atananlar ─────────────────────────────

export function AssignedSection({ data }: { data: StaffToday }) {
  const { s, locale } = useStaffCopy();
  if (data.assigned.length === 0) return null;
  return (
    <SectionCard title={s.assigned.title} description={s.assigned.hint} icon={<MessageSquareQuote className="h-4 w-4" aria-hidden />} density="compact">
      <ul className="divide-y divide-border">
        {data.assigned.map((a) => (
          <li key={`${a.kind}-${a.id}`} className="flex items-start gap-3 py-2.5">
            <StatusBadge label={a.kind === 'action' ? s.assigned.action : s.assigned.incident} tone={a.kind === 'incident' ? 'warning' : 'info'} size="sm" icon={null} />
            <div className="min-w-0 flex-1">
              <p className="qx-small text-fg">{a.title}</p>
              {a.dueAt && <p className="qx-caption qx-num text-fg-muted">{s.tasks.due(fmtDateTime(a.dueAt, locale))}</p>}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ───────────────────────────── Kontrol listeleri ─────────────────────────────

export function ChecklistsSection({ data }: { data: StaffToday }) {
  const { s, locale } = useStaffCopy();
  const { copy } = useTeamCopy();
  const c = s.checklist;
  const [openId, setOpenId] = useState<string | null>(null);
  const current = data.checklists.find((x) => x.id === openId) ?? null;
  if (data.checklists.length === 0) return null;
  const ordered = [...data.checklists].sort((a, b) => {
    const rank = (x: StaffChecklistDto) => (x.doneTodayAt ? 3 : x.type === 'open' ? (data.activeShift ? 0 : 1) : x.type === 'close' ? (data.activeShift ? 1 : 2) : 2);
    return rank(a) - rank(b);
  });
  return (
    <SectionCard title={c.title} icon={<ListChecks className="h-4 w-4" aria-hidden />} density="compact">
      <ul className="space-y-2">
        {ordered.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setOpenId(t.id)}
              className="flex min-h-12 w-full items-center gap-3 rounded-control border border-subtle bg-surface-1 px-3 py-2 text-left transition-colors duration-fast hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.doneTodayAt ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden /> : <ListChecks className="h-5 w-5 shrink-0 text-fg-muted" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-fg">{t.title}</span>
                <span className="qx-caption text-fg-muted">
                  {copy.checklistType[t.type]} · {t.doneTodayAt ? c.doneAt(fmtTime(t.doneTodayAt, locale)) : c.progress(0, t.items.length)}
                </span>
              </span>
              <span className="qx-small font-medium text-brand">{c.open}</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!current} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          {current ? <ChecklistRunner key={current.id} tpl={current} shiftId={data.activeShift?.id ?? null} onClose={() => setOpenId(null)} /> : null}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function ChecklistRunner({ tpl, shiftId, onClose }: { tpl: StaffChecklistDto; shiftId: string | null; onClose: () => void }) {
  const { s, locale } = useStaffCopy();
  const { copy } = useTeamCopy();
  const c = s.checklist;
  const [done, setDone] = useState<Record<string, boolean>>({});
  const submit = useTodayMutation(
    () =>
      sendJson('/api/staff/checklists/complete', 'POST', {
        templateId: tpl.id,
        shiftId: shiftId ?? undefined,
        items: tpl.items.map((i) => ({ itemId: i.id, done: !!done[i.id] })),
      }),
    c.sent
  );
  const doneCount = tpl.items.filter((i) => done[i.id]).length;
  const requiredLeft = tpl.items.filter((i) => i.required && !done[i.id]).length;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate(undefined, { onSuccess: onClose });
      }}
    >
      <DialogHeader>
        <DialogTitle>{tpl.title}</DialogTitle>
        <DialogDescription>
          {copy.checklistType[tpl.type]}
          {tpl.doneTodayAt ? ` · ${c.doneAt(fmtTime(tpl.doneTodayAt, locale))}` : ` · ${c.progress(doneCount, tpl.items.length)}`}
        </DialogDescription>
      </DialogHeader>
      <ul className="space-y-1.5">
        {tpl.items.map((it) => (
          <li key={it.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-subtle px-3 py-2 has-[:checked]:border-success/50 has-[:checked]:bg-success-subtle">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                checked={!!done[it.id]}
                disabled={!!tpl.doneTodayAt}
                onChange={(e) => setDone((p) => ({ ...p, [it.id]: e.target.checked }))}
              />
              <span className="min-w-0 flex-1 text-fg">{it.label}</span>
              {it.required && <span className="qx-caption text-fg-muted">{c.required}</span>}
            </label>
          </li>
        ))}
      </ul>
      {!tpl.doneTodayAt && (
        <DialogFooter className="gap-2 sm:items-center sm:justify-between">
          <p className="qx-caption text-fg-muted" aria-live="polite">
            {requiredLeft ? c.requiredLeft(requiredLeft) : c.progress(doneCount, tpl.items.length)}
          </p>
          <Button type="submit" className="min-h-11" disabled={requiredLeft > 0 || submit.isPending} aria-busy={submit.isPending}>
            {submit.isPending ? c.submitting : c.submit}
          </Button>
        </DialogFooter>
      )}
    </form>
  );
}

// ───────────────────────────── Geri bildirim ─────────────────────────────

export function FeedbackSection({ data }: { data: StaffToday }) {
  const { s, locale } = useStaffCopy();
  const c = s.feedback;
  const f = data.feedback;
  const fmt = (v: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  const delta = f.last30.avg != null && f.prev30.avg != null && f.prev30.n >= 3 ? Math.round((f.last30.avg - f.prev30.avg) * 10) / 10 : null;
  return (
    <SectionCard title={c.title} icon={<Star className="h-4 w-4" aria-hidden />} density="compact">
      {f.last30.n === 0 ? (
        <p className="qx-small text-fg-muted">{c.none}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <p className="qx-num text-3xl font-bold text-fg">
              {fmt(f.last30.avg ?? 0)}
              <span className="ml-1 text-lg text-warning" aria-hidden>
                ★
              </span>
            </p>
            <div className="qx-caption pb-1 text-fg-muted">
              <p>
                {c.avg} · {c.count(f.last30.n)}
              </p>
              {delta != null && delta !== 0 && (
                <p className={delta > 0 ? 'text-success' : 'text-danger'}>{c.vsPrev(`${delta > 0 ? '+' : ''}${fmt(delta)}`)}</p>
              )}
            </div>
          </div>
          {f.recent.length > 0 && (
            <div>
              <p className="qx-caption font-semibold text-fg-muted">{c.recent}</p>
              <ul className="mt-1.5 space-y-2">
                {f.recent.map((r, i) => (
                  <li key={i} className="rounded-control bg-surface-muted px-3 py-2">
                    <p className="qx-caption qx-num text-warning" aria-label={`${r.rating}/5`}>
                      {'★'.repeat(r.rating)}
                      <span className="text-fg-subtle">{'★'.repeat(Math.max(0, 5 - r.rating))}</span>
                      <span className="ml-2 text-fg-muted">{fmtRelative(r.createdAt, locale)}</span>
                    </p>
                    {r.text && <p className="qx-small mt-0.5 text-fg">“{r.text}”</p>}
                  </li>
                ))}
              </ul>
              <p className="qx-caption mt-1.5 text-fg-subtle">{c.privacy}</p>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ───────────────────────────── Takvim ─────────────────────────────

export function CalendarSection({ data }: { data: StaffToday }) {
  const { s, locale } = useStaffCopy();
  const { copy } = useTeamCopy();
  return (
    <SectionCard id="takvim" title={s.calendar.title} density="compact">
      {data.weekShifts.length === 0 ? (
        <p className="qx-small text-fg-muted">{s.calendar.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.weekShifts.map((sh) => (
            <li key={sh.id} className="flex items-center gap-3 py-2">
              <span className={cn('qx-small w-28 shrink-0 font-medium', sh.date === data.todayYmd ? 'text-brand' : 'text-fg')}>
                {sh.date === data.todayYmd ? s.calendar.todayTag : fmtDay(sh.date, locale)}
              </span>
              <span className="qx-small qx-num flex-1 text-fg">
                {sh.startTime}–{sh.endTime}
                {sh.note ? <span className="qx-caption ml-2 text-fg-muted">{sh.note}</span> : null}
              </span>
              <span className="qx-caption text-fg-muted">{copy.attendance[sh.state]}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ───────────────────────────── İzin ─────────────────────────────

export function LeaveSection({ data }: { data: StaffToday }) {
  const { s, locale } = useStaffCopy();
  const c = s.leave;
  const [start, setStart] = useState(addDays(data.todayYmd, 1));
  const [end, setEnd] = useState(addDays(data.todayYmd, 1));
  const [reason, setReason] = useState('');
  const create = useTodayMutation(
    (v: { startDate: string; endDate: string; reason?: string }) => sendJson('/api/staff/leave', 'POST', v),
    c.sent
  );
  const cancel = useTodayMutation((id: string) => sendJson(`/api/staff/leave?id=${encodeURIComponent(id)}`, 'DELETE'), c.cancelled);
  const conflicts = useMemo(() => data.weekShifts.filter((x) => x.date >= start && x.date <= end).length, [data.weekShifts, start, end]);
  const inputCls =
    'min-h-11 w-full rounded-control border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <SectionCard id="izin" title={c.title} density="compact">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ startDate: start, endDate: end < start ? start : end, reason: reason.trim() || undefined }, { onSuccess: () => setReason('') });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="izin-bas" className="qx-small font-medium text-fg">
              {c.start}
            </label>
            <input
              id="izin-bas"
              type="date"
              min={data.todayYmd}
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (end < e.target.value) setEnd(e.target.value);
              }}
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="izin-bit" className="qx-small font-medium text-fg">
              {c.end}
            </label>
            <input id="izin-bit" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="izin-neden" className="qx-small font-medium text-fg">
            {c.reason}
          </label>
          <input id="izin-neden" value={reason} maxLength={500} placeholder={c.reasonPh} onChange={(e) => setReason(e.target.value)} className={inputCls} />
        </div>
        {conflicts > 0 && <p className="qx-caption text-warning">{c.conflictWarn(conflicts)}</p>}
        <Button type="submit" variant="outline" className="min-h-11 w-full" disabled={create.isPending} aria-busy={create.isPending}>
          {create.isPending ? c.sending : c.send}
        </Button>
      </form>
      <div className="mt-4">
        {data.leave.length === 0 ? (
          <p className="qx-small text-fg-muted">{c.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.leave.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="qx-small qx-num block font-medium text-fg">
                    {l.startDate === l.endDate ? fmtDay(l.startDate, locale) : `${fmtDay(l.startDate, locale)} – ${fmtDay(l.endDate, locale)}`}
                    <span className="ml-2 font-normal text-fg-muted">{c.days(l.days)}</span>
                  </span>
                  {l.reason && <span className="qx-caption block text-fg-muted">{l.reason}</span>}
                </span>
                <LeaveStatusBadge status={l.status} />
                {l.status === 'pending' && (
                  <ConfirmAction
                    tone="warning"
                    title={c.cancel}
                    confirmLabel={c.cancel}
                    irreversibleNote={false}
                    onConfirm={() => cancel.mutateAsync(l.id)}
                    trigger={
                      <Button variant="ghost" size="sm" className="min-h-11">
                        {c.cancel}
                      </Button>
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

// ───────────────────────────── Eğitim ─────────────────────────────

export function TrainingSection({ data }: { data: StaffToday }) {
  const { s, locale } = useStaffCopy();
  const c = s.training;
  const [openId, setOpenId] = useState<string | null>(null);
  if (data.training.length === 0) return null;
  const doneN = data.training.filter((t) => t.completedAt).length;
  return (
    <SectionCard id="egitim" title={c.title} description={c.progress(doneN, data.training.length)} icon={<BookOpen className="h-4 w-4" aria-hidden />} density="compact">
      <ul className="divide-y divide-border">
        {data.training.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2.5">
            {t.completedAt ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden /> : <BookOpen className="h-5 w-5 shrink-0 text-fg-muted" aria-hidden />}
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-fg">{t.title}</span>
              <span className="qx-caption text-fg-muted">{t.completedAt ? c.done(fmtDateTime(t.completedAt, locale)) : t.description ?? c.todo}</span>
            </span>
            <Button variant={t.completedAt ? 'ghost' : 'outline'} size="sm" className="min-h-11" onClick={() => setOpenId(t.id)}>
              {t.completedAt ? c.reread : c.read}
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">{openId ? <TrainingReader id={openId} onClose={() => setOpenId(null)} /> : null}</DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function TrainingReader({ id, onClose }: { id: string; onClose: () => void }) {
  const { s, locale } = useStaffCopy();
  const c = s.training;
  const [ack, setAck] = useState(false);
  const q = useQuery({
    queryKey: ['staff-training', id],
    queryFn: () => teamFetch<{ title: string; description: string | null; content: string; completedAt: string | null }>(`/api/staff/training/${id}`),
  });
  const confirm = useTodayMutation(() => sendJson('/api/staff/training/complete', 'POST', { moduleId: id, acknowledged: true }), c.confirmed);
  if (q.isLoading) {
    return (
      <div className="grid min-h-40 place-items-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-fg-muted" aria-hidden />
      </div>
    );
  }
  if (q.isError || !q.data) return <ErrorState description={(q.error as Error | null)?.message} onRetry={() => q.refetch()} />;
  const mod = q.data;
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{mod.title}</DialogTitle>
        {mod.description && <DialogDescription>{mod.description}</DialogDescription>}
      </DialogHeader>
      {/* İçerik düz metin olarak basılır (HTML çalıştırılmaz → XSS yok). */}
      <article className="qx-body max-h-[55dvh] overflow-y-auto whitespace-pre-wrap rounded-control bg-surface-muted p-4 leading-relaxed text-fg" tabIndex={0}>
        {mod.content}
      </article>
      {mod.completedAt ? (
        <p className="qx-small inline-flex items-center gap-2 text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {c.done(fmtDateTime(mod.completedAt, locale))}
        </p>
      ) : (
        <DialogFooter className="gap-3 sm:items-center sm:justify-between">
          <label className="qx-small inline-flex min-h-11 items-center gap-2 text-fg">
            <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            {c.ack}
          </label>
          <Button className="min-h-11" disabled={!ack || confirm.isPending} aria-busy={confirm.isPending} onClick={() => confirm.mutate(undefined, { onSuccess: onClose })}>
            {c.confirm}
          </Button>
        </DialogFooter>
      )}
    </div>
  );
}

// ───────────────────────────── Saha bildirimlerim ─────────────────────────────

export function ReportsSection({ data, queued }: { data: StaffToday; queued: number }) {
  const { s, locale } = useStaffCopy();
  const { copy } = useTeamCopy();
  if (data.fieldReports.length === 0 && queued === 0) return null;
  return (
    <SectionCard id="bildirimlerim" title={s.reports.title} density="compact">
      {queued > 0 && <p className="qx-small mb-2 rounded-control bg-warning-subtle px-3 py-2 text-fg">{s.reports.queued(queued)}</p>}
      {data.fieldReports.length === 0 ? (
        <p className="qx-small text-fg-muted">{s.reports.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.fieldReports.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="qx-small block font-medium text-fg">
                  {copy.fieldCategory[r.category]}
                  {r.urgent ? ` · ${copy.field.urgent}` : ''}
                </span>
                {r.note && <span className="qx-caption block text-fg-muted">{r.note}</span>}
                <span className="qx-caption text-fg-subtle">{fmtRelative(r.createdAt, locale)}</span>
              </span>
              <FieldStatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
