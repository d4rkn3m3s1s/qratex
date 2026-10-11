'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { CalendarClock, CheckCircle2, Loader2, LogIn, LogOut, TimerReset } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { CLOCK_IN_EARLY_MIN } from '@/lib/staff-ops/core';
import { STAFF_TODAY_QUERY_KEY, type ShiftDto, type StaffToday } from '@/lib/staff-ops/types';
import { cn } from '@/lib/utils';
import { fmtDay, fmtMinutes, fmtTime, sendJson } from '@/components/dealer/b-ekip/shared';
import { useStaffCopy } from './copy';

function useNow(intervalMs: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Vardiya kartı — durum makinesine göre tek büyük birincil buton:
 * planlı → "Vardiyaya başla" (pencere dışında devre dışı + neden), vardiyada → canlı sayaç + "Vardiyayı bitir",
 * tamamlandı → çalışılan süre, vardiya yok → sıradaki vardiya. Karar sunucudadır; istemci yalnız gösterir.
 */
export function ShiftCard({ data }: { data: StaffToday }) {
  const { s, locale } = useStaffCopy();
  const c = s.shift;
  const motion = useMotionPolicy();
  const qc = useQueryClient();
  const active = data.activeShift;
  const shift: ShiftDto | null = active ?? data.todayShift;
  const now = useNow(active ? 1000 : 30_000, true);

  const clock = useMutation({
    mutationFn: (v: { shiftId: string; action: 'clock_in' | 'clock_out' }) => sendJson('/api/staff/shifts', 'PATCH', v),
    onSuccess: (_r, v) => {
      toast.success(v.action === 'clock_in' ? c.clockedIn : c.clockedOut);
      void qc.invalidateQueries({ queryKey: [STAFF_TODAY_QUERY_KEY] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  let state: 'none' | 'planned' | 'working' | 'done' = 'none';
  if (active) state = 'working';
  else if (shift?.clockOutAt) state = 'done';
  else if (shift) state = 'planned';

  const startMs = shift?.startAt ? Date.parse(shift.startAt) : null;
  const endMs = shift?.endAt ? Date.parse(shift.endAt) : null;
  const t = now;
  const tooEarlyMin = state === 'planned' && startMs != null ? Math.ceil((startMs - CLOCK_IN_EARLY_MIN * 60_000 - t) / 60_000) : 0;
  const over = state === 'planned' && endMs != null && t > endMs;
  const canStart = state === 'planned' && tooEarlyMin <= 0 && !over;
  const closeList = data.checklists.find((x) => x.type === 'close' && !x.doneTodayAt);

  return (
    <section
      aria-labelledby="vardiya-baslik"
      className={cn(
        'overflow-hidden rounded-card border bg-surface-1 qx-elevation-1',
        state === 'working' ? 'border-success/50' : 'border-subtle'
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-subtle px-card py-3">
        <h2 id="vardiya-baslik" className="qx-small inline-flex items-center gap-2 font-semibold text-fg">
          <CalendarClock className="h-4 w-4 text-fg-muted" aria-hidden />
          {c.title}
        </h2>
        {shift && (
          <span className="qx-caption qx-num text-fg-muted">
            {fmtDay(shift.date, locale)} · {c.planned(shift.startTime, shift.endTime)}
          </span>
        )}
      </div>
      <div className="px-card py-5" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={state}
            initial={motion.reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={motion.transition({ duration: DURATION.base, ease: EASE.standard })}
            className="space-y-4"
          >
            {state === 'working' && active && (
              <>
                <div>
                  <p className="qx-small font-medium text-success">{c.working}</p>
                  <p className="qx-num mt-1 text-4xl font-bold tracking-tight text-fg tabular-nums" aria-label={c.elapsed} suppressHydrationWarning>
                    {active.clockInAt ? hms(now - Date.parse(active.clockInAt)) : '—'}
                  </p>
                  <p className="qx-caption mt-1 text-fg-muted">
                    {c.until(fmtTime(active.endAt, locale))}
                    {active.lateMinutes ? ` · ${c.late(active.lateMinutes)}` : ''}
                  </p>
                </div>
                {closeList && <p className="qx-small rounded-control bg-warning-subtle px-3 py-2 text-fg">{c.openChecklistFirst(closeList.title)}</p>}
                <ConfirmAction
                  tone="brand"
                  title={c.endConfirm}
                  description={c.endConfirmDesc}
                  confirmLabel={c.end}
                  irreversibleNote={false}
                  onConfirm={() => clock.mutateAsync({ shiftId: active.id, action: 'clock_out' })}
                  trigger={
                    <Button variant="outline" className="min-h-12 w-full text-base" disabled={clock.isPending}>
                      <LogOut className="mr-2 h-5 w-5" aria-hidden />
                      {c.end}
                    </Button>
                  }
                />
              </>
            )}
            {state === 'planned' && shift && (
              <>
                {shift.note && (
                  <p className="qx-small text-fg">
                    <span className="text-fg-muted">{c.note}: </span>
                    {shift.note}
                  </p>
                )}
                <Button
                  className="min-h-12 w-full text-base"
                  disabled={!canStart || clock.isPending}
                  aria-busy={clock.isPending}
                  onClick={() => clock.mutate({ shiftId: shift.id, action: 'clock_in' })}
                  aria-describedby={!canStart ? 'vardiya-neden' : undefined}
                >
                  {clock.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden /> : <LogIn className="mr-2 h-5 w-5" aria-hidden />}
                  {clock.isPending ? c.starting : c.start}
                </Button>
                {!canStart && (
                  <p id="vardiya-neden" className="qx-caption text-fg-muted">
                    {over ? c.over : c.tooEarly(tooEarlyMin)}
                  </p>
                )}
              </>
            )}
            {state === 'done' && shift && (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden />
                <div>
                  <p className="font-semibold text-fg">{c.done}</p>
                  <p className="qx-small qx-num text-fg-muted">
                    {fmtTime(shift.clockInAt, locale)}–{fmtTime(shift.clockOutAt, locale)} · {c.worked(fmtMinutes(shift.workedMinutes, locale))}
                  </p>
                </div>
              </div>
            )}
            {state === 'none' && (
              <div className="flex items-start gap-3">
                <TimerReset className="mt-0.5 h-6 w-6 shrink-0 text-fg-muted" aria-hidden />
                <div>
                  <p className="font-semibold text-fg">{c.none}</p>
                  <p className="qx-small text-fg-muted">
                    {data.nextShift
                      ? c.next(`${fmtDay(data.nextShift.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })} ${data.nextShift.startTime}`)
                      : c.noNext}
                  </p>
                </div>
              </div>
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
