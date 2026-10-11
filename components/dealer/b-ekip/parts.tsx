'use client';

import { useId, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, CheckCircle2, CircleDashed, Clock, LogIn, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ds';
import type { Tone } from '@/components/states';
import { TEAM_HUB_QUERY_KEY } from '@/lib/staff-ops/types';
import type { AttendanceState } from '@/lib/staff-ops/core';
import { initials, TeamApiError } from './shared';
import { useTeamCopy } from './copy';

export const INPUT_CLS =
  'min-h-11 w-full rounded-control border border-input bg-background px-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

export function PersonAvatar({ name, image, size = 'md' }: { name: string | null; image?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-12 w-12 text-base' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className={cn('shrink-0 rounded-full object-cover', dim)} loading="lazy" referrerPolicy="no-referrer" />;
  }
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full bg-brand-subtle font-semibold text-brand', dim)}>
      {initials(name)}
    </span>
  );
}

const ATTENDANCE_TONE: Record<AttendanceState, { tone: Tone; icon: typeof Clock }> = {
  scheduled: { tone: 'info', icon: Clock },
  upcoming: { tone: 'neutral', icon: CalendarClock },
  late: { tone: 'warning', icon: Clock },
  working: { tone: 'success', icon: LogIn },
  done: { tone: 'neutral', icon: CheckCircle2 },
  missed: { tone: 'danger', icon: UserX },
};

export function AttendanceBadge({ state, size = 'sm' }: { state: AttendanceState; size?: 'sm' | 'md' }) {
  const { copy } = useTeamCopy();
  const meta = ATTENDANCE_TONE[state];
  return <StatusBadge label={copy.attendance[state]} tone={meta.tone} icon={meta.icon} size={size} />;
}

const TASK_TONE: Record<string, Tone> = { pending: 'info', in_progress: 'brand', completed: 'success', cancelled: 'neutral' };

export function TaskStatusBadge({ status }: { status: string }) {
  const { copy } = useTeamCopy();
  return (
    <StatusBadge
      label={copy.taskStatus[status] ?? status}
      tone={TASK_TONE[status] ?? 'neutral'}
      icon={status === 'pending' ? CircleDashed : undefined}
      size="sm"
    />
  );
}

const LEAVE_TONE: Record<string, Tone> = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral' };

export function LeaveStatusBadge({ status }: { status: string }) {
  const { copy } = useTeamCopy();
  return <StatusBadge label={copy.leaveStatus[status] ?? status} tone={LEAVE_TONE[status] ?? 'neutral'} size="sm" />;
}

const FIELD_TONE: Record<string, Tone> = { open: 'warning', seen: 'info', resolved: 'success' };

export function FieldStatusBadge({ status }: { status: string }) {
  const { copy } = useTeamCopy();
  return <StatusBadge label={copy.fieldStatus[status] ?? status} tone={FIELD_TONE[status] ?? 'neutral'} size="sm" />;
}

/** Erişilebilir segment seçici (radiogroup, ok tuşlarıyla gezinilir). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode; count?: number }>;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-control bg-surface-muted p-1', className)}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
              onChange(next.value);
              const parent = e.currentTarget.parentElement;
              requestAnimationFrame(() => (parent?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
            }}
            className={cn(
              'qx-small inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip px-3 font-medium transition-colors duration-fast',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-surface-1 text-fg qx-elevation-1' : 'text-fg-muted hover:text-fg'
            )}
          >
            {o.label}
            {typeof o.count === 'number' && <span className="qx-caption qx-num rounded-chip bg-surface-muted px-1.5 text-fg-muted">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Etiket + kontrol + ipucu/hata (id/htmlFor/aria-describedby bağlı). */
export function FormRow({
  label,
  hint,
  error,
  children,
  optional,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const { copy } = useTeamCopy();
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="qx-small block font-medium text-fg">
        {label}
        {optional && <span className="ml-1 font-normal text-fg-muted">({copy.common.optional})</span>}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {hint && !error && (
        <p id={hintId} className="qx-caption text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="qx-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Ekip merkezi yazma işlemleri: başarıda hub yenilenir + bildirim; hatada sunucunun Türkçe mesajı. */
export function useHubMutation<V, R = unknown>(fn: (v: V) => Promise<R>, opts: { success?: string | ((r: R) => string); onSuccess?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  const { copy } = useTeamCopy();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(r);
      void qc.invalidateQueries({ queryKey: [TEAM_HUB_QUERY_KEY] });
    },
    onError: (err) => {
      toast.error(err instanceof TeamApiError || err instanceof Error ? err.message : copy.common.actionFailed);
    },
  });
}
