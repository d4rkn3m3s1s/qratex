'use client';

/**
 * CSM görevleri — liste (durum/öncelik/sorumlu/açılış skoru) + geçişler (başlat, çöz, yeniden aç,
 * üstlen) + yeni görev formu. Yazmalar iyimser kilitli (`expectedStatus`), denetim izine düşer.
 */
import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState, InlineError } from '@/components/states';
import { StatusBadge } from '@/components/ds/data';
import { ChoiceChips, announce } from '@/components/ds/a11y';
import { CSM_PRIORITIES, type CsmPriority, type CsmStatus, type HealthWindow } from '../domain';
import { createCsmTask, updateCsmTask, type DealerHealthDetail } from '../client/api';
import type { HealthCopy } from '../copy';

type Task = DealerHealthDetail['csmTasks'][number];

const STATUS_TONE = { open: 'warning', in_progress: 'info', resolved: 'success' } as const;
const PRIORITY_TONE = { low: 'neutral', medium: 'warning', high: 'danger' } as const;

function fmtDate(iso: string, locale: 'tr' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

/** `<input type="date">` değerini İstanbul gün sonuna (23:59) çevirir. */
function istanbulEndOfDay(day: string): string {
  return `${day}T23:59:00+03:00`;
}

export function CsmSection({
  dealerId,
  window,
  tasks,
  c,
  locale,
  formOpen,
  onFormOpenChange,
  initialNote,
}: {
  dealerId: string;
  window: HealthWindow;
  tasks: Task[];
  c: HealthCopy;
  locale: 'tr' | 'en';
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
  initialNote: string;
}) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (v: { id: string; status?: CsmStatus; assignToMe?: boolean; expectedStatus: CsmStatus }) =>
      updateCsmTask(v.id, { status: v.status, assignToMe: v.assignToMe, expectedStatus: v.expectedStatus }),
    onSuccess: () => {
      toast.success(c.csm.updated);
      announce(c.csm.updated);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['dealer-health'] }),
  });

  return (
    <div className="space-y-3">
      {tasks.length === 0 && !formOpen ? (
        <EmptyState compact title={c.detail.noCsm} headingLevel="p" />
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const busy = update.isPending && update.variables?.id === t.id;
            return (
              <li key={t.id} className="rounded-xl border border-border bg-surface-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={c.csm.status[t.status]} tone={STATUS_TONE[t.status]} size="sm" />
                  <StatusBadge
                    label={c.csm.priority[(t.priority as CsmPriority) in PRIORITY_TONE ? (t.priority as CsmPriority) : 'medium']}
                    tone={PRIORITY_TONE[(t.priority as CsmPriority) in PRIORITY_TONE ? (t.priority as CsmPriority) : 'medium']}
                    size="sm"
                    icon={null}
                  />
                  <span className="text-xs text-fg-muted">{c.csm.types[t.type] ?? t.type}</span>
                  <span className="ml-auto text-xs text-fg-subtle">{fmtDate(t.createdAt, locale)}</span>
                </div>
                {t.note && <p className="mt-2 whitespace-pre-line text-sm text-fg">{t.note}</p>}
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg-muted">
                  <span>{t.assignedToName ? c.csm.assigned(t.assignedToName) : c.csm.unassigned}</span>
                  {t.healthScore != null && <span>{c.csm.scoreAt(t.healthScore)}</span>}
                  {t.dueAt && <span>{c.csm.due(fmtDate(t.dueAt, locale))}</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.status === 'open' && (
                    <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={busy}
                      onClick={() => update.mutate({ id: t.id, status: 'in_progress', expectedStatus: t.status })}>
                      {c.csm.start}
                    </Button>
                  )}
                  {t.status !== 'resolved' ? (
                    <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={busy}
                      onClick={() => update.mutate({ id: t.id, status: 'resolved', expectedStatus: t.status })}>
                      {c.csm.resolve}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" disabled={busy}
                      onClick={() => update.mutate({ id: t.id, status: 'open', expectedStatus: t.status })}>
                      {c.csm.reopen}
                    </Button>
                  )}
                  {t.status !== 'resolved' && (
                    <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" disabled={busy}
                      onClick={() => update.mutate({ id: t.id, assignToMe: !t.assignedToName, expectedStatus: t.status })}>
                      {t.assignedToName ? c.csm.unclaim : c.csm.claim}
                    </Button>
                  )}
                  {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin self-center text-fg-muted motion-reduce:animate-none" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {formOpen ? (
        <CsmCreateForm
          key={initialNote}
          dealerId={dealerId}
          window={window}
          c={c}
          initialNote={initialNote}
          onDone={() => onFormOpenChange(false)}
        />
      ) : (
        <Button variant="outline" size="sm" className="min-h-11" onClick={() => onFormOpenChange(true)}>
          <Plus aria-hidden className="mr-1.5 h-4 w-4" />
          {c.csm.newTitle}
        </Button>
      )}
    </div>
  );
}

function CsmCreateForm({
  dealerId,
  window,
  c,
  initialNote,
  onDone,
}: {
  dealerId: string;
  window: HealthWindow;
  c: HealthCopy;
  initialNote: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const ids = useId();
  const [note, setNote] = useState(initialNote);
  const [priority, setPriority] = useState<CsmPriority>('medium');
  const [due, setDue] = useState('');
  const [assignToMe, setAssignToMe] = useState(true);
  const [key] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())));

  const create = useMutation({
    mutationFn: () =>
      createCsmTask(dealerId, { note: note.trim(), priority, dueAt: due ? istanbulEndOfDay(due) : null, assignToMe, window }, key),
    onSuccess: () => {
      toast.success(c.csm.created);
      announce(c.csm.created);
      void qc.invalidateQueries({ queryKey: ['dealer-health'] });
      onDone();
    },
  });

  const tooShort = note.trim().length < 3;
  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooShort) create.mutate();
      }}
      aria-labelledby={`${ids}-t`}
    >
      <p id={`${ids}-t`} className="text-sm font-semibold text-fg">
        {c.csm.newTitle}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-note`}>{c.csm.note}</Label>
        <Textarea id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={c.csm.notePlaceholder} maxLength={1000} rows={3} required />
      </div>
      <div className="space-y-1.5">
        <span id={`${ids}-p`} className="text-sm font-medium text-fg">
          {c.csm.priorityLabel}
        </span>
        <ChoiceChips
          aria-labelledby={`${ids}-p`}
          options={CSM_PRIORITIES.map((p) => ({ value: p, label: c.csm.priority[p] }))}
          value={priority}
          onChange={(v) => v && setPriority(v)}
          size="sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-due`}>{c.csm.dueLabel}</Label>
        <Input id={`${ids}-due`} type="date" value={due} onChange={(e) => setDue(e.target.value)} className="min-h-11 w-full sm:w-48" />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-fg">
        <Checkbox checked={assignToMe} onCheckedChange={(v) => setAssignToMe(v === true)} />
        {c.csm.assignToMe}
      </label>
      {create.isError && <InlineError variant="banner">{(create.error as Error).message}</InlineError>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" disabled={tooShort || create.isPending}>
          {create.isPending && <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {create.isPending ? c.csm.creating : c.csm.create}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onDone}>
          {c.csm.cancel}
        </Button>
      </div>
    </form>
  );
}
