'use client';

import { useId, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Search, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Timeline, type TimelineEvent } from '@/components/ds/data';
import type { Tone } from '@/components/states';
import type { AssigneeDto, TimelineEntryDto } from '@/lib/dealer-queues/types';
import { fetchJson, queueKeys } from './api';
import { useSharedCopy, useQueueLocale } from './copy';
import { formatDateTime, formatRelative, todayIstanbulYmd, toIstanbulYmd } from './format';

/* ───────────────────────── Zaman ───────────────────────── */

/** Göreli zaman; mutlak zaman `title` ve `dateTime`'da. Sunucu/istemci saat farkı uyarı üretmez. */
export function RelTime({ iso, className }: { iso: string; className?: string }) {
  const locale = useQueueLocale();
  return (
    <time dateTime={iso} title={formatDateTime(iso, locale)} className={className} suppressHydrationWarning>
      {formatRelative(iso, locale)}
    </time>
  );
}

/** Son tarih çipi: gecikmişse tehlike tonu + "Gecikti". */
export function DueChip({ dueAt, overdue, className }: { dueAt: string | null; overdue: boolean; className?: string }) {
  const copy = useSharedCopy();
  const locale = useQueueLocale();
  if (!dueAt) return null;
  const rel = formatRelative(dueAt, locale);
  return (
    <span
      className={cn(
        'qx-caption inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 ring-1 ring-inset',
        overdue ? 'bg-danger-subtle text-danger ring-danger-border' : 'bg-surface-muted text-fg-muted ring-border',
        className
      )}
      title={formatDateTime(dueAt, locale)}
      suppressHydrationWarning
    >
      <CalendarClock aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span suppressHydrationWarning>{overdue ? copy.overdueBy(rel) : copy.dueIn(rel)}</span>
    </span>
  );
}

/* ───────────────────────── Puan ───────────────────────── */

export function RatingStars({ value, className }: { value: number | null; className?: string }) {
  const copy = useSharedCopy();
  if (value == null) return null;
  const v = Math.max(0, Math.min(5, Math.round(value)));
  const tone = v <= 2 ? 'text-danger' : v === 3 ? 'text-warning' : 'text-success';
  return (
    <span role="img" aria-label={copy.rating(v)} className={cn('inline-flex items-center gap-0.5', className)}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden className={cn('h-3.5 w-3.5', i < v ? cn(tone, 'fill-current') : 'text-fg-subtle')} />
      ))}
    </span>
  );
}

/* ───────────────────────── Kişi ───────────────────────── */

function initials(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? (p[p.length - 1][0] ?? '') : '')).toLocaleUpperCase('tr-TR');
}

export function Avatar({ name, size = 'md', tone = 'neutral' }: { name: string; size?: 'sm' | 'md'; tone?: 'neutral' | 'brand' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold',
        size === 'sm' ? 'h-6 w-6 text-[11px]' : 'h-9 w-9 text-xs',
        tone === 'brand' ? 'bg-brand-subtle text-brand ring-1 ring-inset ring-brand-border' : 'bg-surface-muted text-fg-muted ring-1 ring-inset ring-border'
      )}
    >
      {initials(name)}
    </span>
  );
}

export function PersonChip({ person, className }: { person: AssigneeDto | null; className?: string }) {
  const copy = useSharedCopy();
  if (!person) {
    return <span className={cn('qx-caption text-fg-subtle', className)}>{copy.unassigned}</span>;
  }
  return (
    <span className={cn('qx-caption inline-flex min-w-0 items-center gap-1.5 text-fg-muted', className)}>
      <Avatar name={person.name} size="sm" tone={person.isMe ? 'brand' : 'neutral'} />
      <span className="truncate">
        <span className="sr-only">{copy.assignee}: </span>
        {person.isMe ? `${person.name} (${copy.me})` : person.name}
      </span>
    </span>
  );
}

/* ───────────────────────── Form parçaları ───────────────────────── */

export function useAssignees(initial?: AssigneeDto[] | null, enabled = true) {
  return useQuery({
    queryKey: queueKeys.assignees,
    queryFn: ({ signal }) => fetchJson<{ items: AssigneeDto[] }>('/api/dealer/queues/assignees', { signal }).then((r) => r.items),
    initialData: initial ?? undefined,
    staleTime: 5 * 60_000,
    enabled,
  });
}

const selectClass =
  'h-11 w-full min-w-0 rounded-control border border-strong bg-surface-1 px-3 text-sm text-fg shadow-none outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export function AssigneeSelect({
  value,
  onChange,
  assignees,
  disabled,
  id,
  allowEmpty = true,
  'aria-label': ariaLabel,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  assignees: AssigneeDto[] | undefined;
  disabled?: boolean;
  id?: string;
  allowEmpty?: boolean;
  'aria-label'?: string;
}) {
  const copy = useSharedCopy();
  const list = assignees ?? [];
  const known = value ? list.some((a) => a.id === value) : true;
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      className={selectClass}
      value={value ?? ''}
      disabled={disabled || list.length === 0}
      onChange={(e) => onChange(e.target.value || null)}
    >
      {allowEmpty && <option value="">{copy.noAssignee}</option>}
      {!known && value && <option value={value}>{copy.unassigned}</option>}
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.isMe ? `${a.name} (${copy.me})` : a.name}
          {a.role === 'owner' ? ` · ${copy.owner}` : a.jobTitle ? ` · ${a.jobTitle}` : ''}
        </option>
      ))}
    </select>
  );
}

export function DueDateInput({
  value,
  onChange,
  disabled,
  id,
  'aria-label': ariaLabel,
}: {
  value: string | null;
  onChange: (ymd: string | null) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}) {
  const copy = useSharedCopy();
  const ymd = value ? (value.length === 10 ? value : toIstanbulYmd(value)) : '';
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        id={id}
        type="date"
        aria-label={ariaLabel}
        className={selectClass}
        value={ymd}
        min={todayIstanbulYmd()}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      />
      {ymd && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={copy.clearDue}
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder ?? label}
        onChange={(e) => onChange(e.target.value)}
        maxLength={80}
        className="h-11 w-full rounded-control border border-strong bg-surface-1 pl-9 pr-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={htmlFor} className="qx-small font-medium text-fg">
        {label}
      </label>
      {children}
      {hint ? <p className="qx-caption text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

/* ───────────────────────── Zaman çizelgesi ───────────────────────── */

const TIMELINE_TONE: Record<string, Tone> = {
  'incident.resolved': 'success',
  'task.created': 'brand',
  'incident.created': 'brand',
  rejected: 'danger',
  expired: 'neutral',
  published: 'brand',
  notified: 'info',
  accepted: 'success',
  completed: 'success',
  restored: 'warning',
  edited: 'neutral',
};

export function QueueTimeline({
  entries,
  labelOf,
}: {
  entries: TimelineEntryDto[];
  /** Ek/özel etiketleme (ör. durum kodlarını çevirme). Yoksa ortak sözlük. */
  labelOf?: (e: TimelineEntryDto) => { title: string; description?: string | null };
}) {
  const copy = useSharedCopy();
  const events: TimelineEvent[] = entries.map((e) => {
    const custom = labelOf?.(e);
    const title = custom?.title ?? copy.timeline[e.kind] ?? e.label;
    const description = custom?.description ?? e.note ?? undefined;
    return {
      id: e.id,
      at: e.at,
      title,
      description: description || undefined,
      actor: e.actorName ?? copy.system,
      tone: TIMELINE_TONE[e.kind] ?? (e.kind.endsWith('.status') ? 'info' : 'neutral'),
    };
  });
  return <Timeline events={events} timeStyle="datetime" dense ariaLabel={copy.timelineTitle} emptyLabel={copy.timelineEmpty} />;
}
