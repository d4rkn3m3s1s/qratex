'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmAction, EmptyState } from '@/components/states';
import type { MemberDto, ShiftDto, TeamHub } from '@/lib/staff-ops/types';
import { cn } from '@/lib/utils';
import { addDays, fmtDay, fmtMinutes, fmtTime, istanbulLocalToIso, isoToIstanbulLocal, sendJson } from './shared';
import { useTeamCopy } from './copy';
import { AttendanceBadge, FormRow, INPUT_CLS, PersonAvatar, useHubMutation } from './parts';

type Draft =
  | { mode: 'create'; userId: string; date: string }
  | { mode: 'edit'; shift: ShiftDto };

export function SchedulePanel({ hub, onWeekChange, loading }: { hub: TeamHub; onWeekChange: (w: string) => void; loading?: boolean }) {
  const { copy, locale } = useTeamCopy();
  const c = copy.schedule;
  const [draft, setDraft] = useState<Draft | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(hub.weekStart, i)), [hub.weekStart]);
  const members = useMemo(() => hub.members.filter((x) => x.isActive), [hub.members]);
  const prevWeek = addDays(hub.weekStart, -7);
  const thisWeekStart = useMemo(() => {
    const dow = new Date(`${hub.todayYmd}T00:00:00Z`).getUTCDay();
    return addDays(hub.todayYmd, -(dow === 0 ? 6 : dow - 1));
  }, [hub.todayYmd]);

  const byCell = useMemo(() => {
    const map = new Map<string, ShiftDto[]>();
    for (const s of hub.shifts) {
      const k = `${s.userId}|${s.date}`;
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [hub.shifts]);

  const leaveDays = useMemo(() => {
    const set = new Set<string>();
    for (const l of hub.leave) {
      if (l.status !== 'approved') continue;
      for (let d = l.startDate; d <= l.endDate; d = addDays(d, 1)) set.add(`${l.userId}|${d}`);
    }
    return set;
  }, [hub.leave]);

  const plannedByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of hub.shifts) map.set(s.userId, (map.get(s.userId) ?? 0) + (s.plannedMinutes ?? 0));
    return map;
  }, [hub.shifts]);

  const copyWeek = useHubMutation(
    () => sendJson<{ created: number; skipped: number }>('/api/dealer/staff/shifts/copy-week', 'POST', { fromWeek: prevWeek, toWeek: hub.weekStart }),
    { success: (r) => c.copied(r.created, r.skipped) }
  );

  if (members.length === 0) return <EmptyState title={c.noStaff} compact />;

  const weekLabel = c.weekOf(fmtDay(days[0], locale, { day: 'numeric', month: 'short' }), fmtDay(days[6], locale, { day: 'numeric', month: 'short' }));

  return (
    <div className="space-y-4" aria-busy={loading}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={c.prevWeek} onClick={() => onWeekChange(prevWeek)}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Button>
          <p className="qx-small min-w-[11rem] text-center font-semibold text-fg" aria-live="polite">
            {weekLabel}
            {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-fg-muted" aria-hidden />}
          </p>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={c.nextWeek} onClick={() => onWeekChange(addDays(hub.weekStart, 7))}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Button>
          {hub.weekStart !== thisWeekStart && (
            <Button variant="outline" size="sm" className="min-h-11" onClick={() => onWeekChange(hub.todayYmd)}>
              {c.thisWeek}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <ConfirmAction
            tone="brand"
            title={c.copyTitle}
            description={c.copyDesc}
            confirmLabel={c.copyPrev}
            irreversibleNote={false}
            onConfirm={() => copyWeek.mutateAsync(undefined)}
            trigger={
              <Button variant="outline" className="min-h-11">
                <Copy className="mr-2 h-4 w-4" aria-hidden />
                {c.copyPrev}
              </Button>
            }
          />
          <Button className="min-h-11" onClick={() => setDraft({ mode: 'create', userId: members[0].userId, date: days.includes(hub.todayYmd) ? hub.todayYmd : days[0] })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            {c.add}
          </Button>
        </div>
      </div>

      {hub.shifts.length === 0 && (
        <p className="qx-small rounded-control bg-surface-muted px-3 py-2 text-fg-muted">
          <strong className="font-semibold text-fg">{c.emptyTitle}.</strong> {c.emptyDesc}
        </p>
      )}

      {/* Masaüstü: kişi × gün ızgarası */}
      <div className="hidden overflow-x-auto rounded-card border border-subtle bg-surface-1 md:block">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <caption className="sr-only">{weekLabel}</caption>
          <thead>
            <tr className="border-b border-subtle">
              <th scope="col" className="qx-caption w-48 px-3 py-2 text-left font-semibold text-fg-muted">
                {c.person}
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  scope="col"
                  className={cn('qx-caption px-2 py-2 text-left font-semibold text-fg-muted', d === hub.todayYmd && 'bg-brand-subtle text-brand')}
                >
                  {fmtDay(d, locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((mem) => (
              <tr key={mem.userId} className="border-b border-subtle last:border-0">
                <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                  <div className="flex items-center gap-2">
                    <PersonAvatar name={mem.name ?? mem.email} image={mem.image} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{mem.name ?? mem.email}</p>
                      <p className="qx-caption qx-num text-fg-muted">{fmtMinutes(plannedByUser.get(mem.userId) ?? 0, locale)}</p>
                    </div>
                  </div>
                </th>
                {days.map((d) => (
                  <td key={d} className={cn('px-1.5 py-1.5 align-top', d === hub.todayYmd && 'bg-brand-subtle/40')}>
                    <DayCell
                      member={mem}
                      day={d}
                      shifts={byCell.get(`${mem.userId}|${d}`) ?? []}
                      onLeave={leaveDays.has(`${mem.userId}|${d}`)}
                      onAdd={() => setDraft({ mode: 'create', userId: mem.userId, date: d })}
                      onEdit={(s) => setDraft({ mode: 'edit', shift: s })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil: gün bazlı liste */}
      <div className="space-y-3 md:hidden">
        {days.map((d) => {
          const rows = members.flatMap((mem) => (byCell.get(`${mem.userId}|${d}`) ?? []).map((s) => ({ mem, s })));
          return (
            <section key={d} aria-label={fmtDay(d, locale, { weekday: 'long', day: 'numeric', month: 'long' })} className="rounded-card border border-subtle bg-surface-1">
              <header className={cn('flex items-center justify-between px-4 py-2', d === hub.todayYmd && 'bg-brand-subtle')}>
                <h3 className="qx-small font-semibold text-fg">{fmtDay(d, locale, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11"
                  aria-label={c.addFor(members[0].name ?? members[0].email, fmtDay(d, locale))}
                  onClick={() => setDraft({ mode: 'create', userId: members[0].userId, date: d })}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
              </header>
              {rows.length === 0 ? (
                <p className="qx-caption px-4 pb-3 text-fg-muted">—</p>
              ) : (
                <ul className="divide-y divide-border">
                  {rows.map(({ mem, s }) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setDraft({ mode: 'edit', shift: s })}
                        className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <PersonAvatar name={mem.name ?? mem.email} image={mem.image} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-fg">{mem.name ?? mem.email}</span>
                          <span className="qx-caption qx-num text-fg-muted">
                            {s.startTime}–{s.endTime}
                          </span>
                        </span>
                        <AttendanceBadge state={s.state} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <ShiftDialog draft={draft} members={members} onClose={() => setDraft(null)} />
    </div>
  );
}

function DayCell({
  member,
  day,
  shifts,
  onLeave,
  onAdd,
  onEdit,
}: {
  member: MemberDto;
  day: string;
  shifts: ShiftDto[];
  onLeave: boolean;
  onAdd: () => void;
  onEdit: (s: ShiftDto) => void;
}) {
  const { copy, locale } = useTeamCopy();
  const c = copy.schedule;
  return (
    <div className={cn('flex min-h-[4.5rem] flex-col gap-1 rounded-control p-1', onLeave && 'bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,hsl(var(--muted))_6px,hsl(var(--muted))_8px)]')}>
      {onLeave && <span className="qx-caption font-medium text-fg-muted">{c.leaveDay}</span>}
      {shifts.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onEdit(s)}
          className="w-full rounded-control border border-subtle bg-surface-2 px-2 py-1.5 text-left transition-colors duration-fast hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${member.name ?? member.email} ${fmtDay(day, locale)} ${s.startTime}–${s.endTime} · ${copy.attendance[s.state]}`}
        >
          <span className="qx-small qx-num block font-semibold text-fg">
            {s.startTime}–{s.endTime}
          </span>
          <span className="mt-1 block">
            <AttendanceBadge state={s.state} />
          </span>
          {s.lateMinutes ? <span className="qx-caption block text-warning">{c.late(s.lateMinutes)}</span> : null}
        </button>
      ))}
      <button
        type="button"
        onClick={onAdd}
        aria-label={c.addFor(member.name ?? member.email, fmtDay(day, locale))}
        className="grid min-h-9 w-full place-items-center rounded-control border border-dashed border-subtle text-fg-muted opacity-60 transition-opacity duration-fast hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function ShiftDialog({ draft, members, onClose }: { draft: Draft | null; members: MemberDto[]; onClose: () => void }) {
  const open = !!draft;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">{draft ? <ShiftForm key={draft.mode === 'edit' ? draft.shift.id : `${draft.userId}${draft.date}`} draft={draft} members={members} onClose={onClose} /> : null}</DialogContent>
    </Dialog>
  );
}

function ShiftForm({ draft, members, onClose }: { draft: Draft; members: MemberDto[]; onClose: () => void }) {
  const { copy, locale } = useTeamCopy();
  const c = copy.schedule;
  const editing = draft.mode === 'edit' ? draft.shift : null;
  const [userId, setUserId] = useState(editing?.userId ?? (draft.mode === 'create' ? draft.userId : ''));
  const [date, setDate] = useState(editing?.date ?? (draft.mode === 'create' ? draft.date : ''));
  const [start, setStart] = useState(editing?.startTime ?? '09:00');
  const [end, setEnd] = useState(editing?.endTime ?? '17:00');
  const [note, setNote] = useState(editing?.note ?? '');
  const [clockIn, setClockIn] = useState(isoToIstanbulLocal(editing?.clockInAt));
  const [clockOut, setClockOut] = useState(isoToIstanbulLocal(editing?.clockOutAt));
  const [error, setError] = useState<string | null>(null);

  const create = useHubMutation(
    (v: { userId: string; date: string; startTime: string; endTime: string; note?: string }) => sendJson('/api/dealer/staff/shifts', 'POST', v),
    { success: c.created, onSuccess: onClose }
  );
  const update = useHubMutation((v: Record<string, unknown>) => sendJson(`/api/dealer/staff/shifts/${editing?.id}`, 'PATCH', v), {
    success: c.updated,
    onSuccess: onClose,
  });
  const remove = useHubMutation(() => sendJson(`/api/dealer/staff/shifts/${editing?.id}`, 'DELETE'), { success: c.deleted, onSuccess: onClose });
  const busy = create.isPending || update.isPending || remove.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (start === end) {
      setError(c.sameTime);
      return;
    }
    setError(null);
    if (!editing) {
      create.mutate({ userId, date, startTime: start, endTime: end, note: note.trim() || undefined });
      return;
    }
    const patch: Record<string, unknown> = { date, startTime: start, endTime: end, note: note.trim() || null };
    const ci = clockIn ? istanbulLocalToIso(clockIn) : null;
    const co = clockOut ? istanbulLocalToIso(clockOut) : null;
    if (isoToIstanbulLocal(editing.clockInAt) !== clockIn) patch.clockInAt = ci;
    if (isoToIstanbulLocal(editing.clockOutAt) !== clockOut) patch.clockOutAt = co;
    update.mutate(patch);
  };

  const person = members.find((x) => x.userId === userId);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? c.editTitle : c.add}</DialogTitle>
        <DialogDescription>{person ? `${person.name ?? person.email} · ${date ? fmtDay(date, locale, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}` : ''}</DialogDescription>
      </DialogHeader>
      {!editing && (
        <FormRow label={c.person}>
          {({ id }) => (
            <select id={id} value={userId} onChange={(e) => setUserId(e.target.value)} className={INPUT_CLS}>
              {members.map((mem) => (
                <option key={mem.userId} value={mem.userId}>
                  {mem.name ?? mem.email}
                </option>
              ))}
            </select>
          )}
        </FormRow>
      )}
      <FormRow label={c.date}>
        {({ id }) => <input id={id} type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={INPUT_CLS} />}
      </FormRow>
      <div className="grid grid-cols-2 gap-3">
        <FormRow label={c.start}>
          {({ id }) => <input id={id} type="time" required value={start} onChange={(e) => setStart(e.target.value)} className={INPUT_CLS} />}
        </FormRow>
        <FormRow label={c.end} error={error}>
          {({ id, describedBy, invalid }) => (
            <input id={id} type="time" required value={end} onChange={(e) => setEnd(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} className={INPUT_CLS} />
          )}
        </FormRow>
      </div>
      <p className="qx-caption -mt-2 text-fg-muted">{c.endHint}</p>
      <FormRow label={c.note} optional>
        {({ id }) => <input id={id} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={INPUT_CLS} />}
      </FormRow>

      {editing && (
        <fieldset className="space-y-3 rounded-card border border-subtle p-3">
          <legend className="qx-small px-1 font-semibold text-fg">{c.correct}</legend>
          <p className="qx-caption text-fg-muted">
            {c.correctHint}
            {editing.workedMinutes != null ? ` · ${c.worked(fmtMinutes(editing.workedMinutes, locale))}` : ''}
            {editing.clockInAt ? ` · ${c.clockIn} ${fmtTime(editing.clockInAt, locale)}` : ''}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormRow label={c.clockIn} optional>
              {({ id }) => <input id={id} type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className={INPUT_CLS} />}
            </FormRow>
            <FormRow label={c.clockOut} optional>
              {({ id }) => <input id={id} type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className={INPUT_CLS} />}
            </FormRow>
          </div>
        </fieldset>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        {editing && !editing.clockInAt ? (
          <ConfirmAction
            tone="danger"
            title={c.deleteTitle}
            description={c.deleteDesc}
            confirmLabel={c.delete}
            irreversibleNote={false}
            onConfirm={() => remove.mutateAsync(undefined)}
            trigger={
              <Button type="button" variant="ghost" className="min-h-11 text-danger" disabled={busy}>
                <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                {c.delete}
              </Button>
            }
          />
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="min-h-11" onClick={onClose} disabled={busy}>
            {copy.common.cancel}
          </Button>
          <Button type="submit" className="min-h-11" disabled={busy || !userId || !date} aria-busy={busy}>
            {busy ? copy.common.saving : copy.common.save}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
