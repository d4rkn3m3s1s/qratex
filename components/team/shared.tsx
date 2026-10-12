'use client';

import { useCallback, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  CircleDashed,
  Clock3,
  Minus,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ds/data';
import { cn, getInitials } from '@/lib/utils';
import { isInitiativePhase, isTaskPriority, isTaskStatus, parseTags } from '@/lib/team/constants';
import { dueInfo } from '@/lib/team/dates';
import type { TeamDepartment, TeamTag } from './lib/types';
import { useTeamCopy, useTeamLabels } from './copy';

export const STATUS_ICON: Record<string, LucideIcon> = {
  todo: Circle,
  in_progress: CircleDashed,
  review: Clock3,
  done: CheckCircle2,
};

export const PRIORITY_ICON: Record<string, LucideIcon> = { high: ArrowUp, medium: Minus, low: ArrowDown };

export function TaskStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const tm = useTeamLabels();
  const meta = isTaskStatus(status) ? tm.STATUS_META[status] : tm.STATUS_META.todo;
  return <StatusBadge label={meta.label} tone={meta.tone} icon={STATUS_ICON[status] ?? Circle} size={size} srPrefix="Durum" />;
}

export function PriorityBadge({ priority, size = 'sm', hideLow = false }: { priority: string; size?: 'sm' | 'md'; hideLow?: boolean }) {
  const tm = useTeamLabels();
  const tu = useTeamCopy().ui;
  if (!isTaskPriority(priority)) return null;
  if (hideLow && priority === 'low') return null;
  const meta = tm.PRIORITY_META[priority];
  return <StatusBadge label={meta.label} tone={meta.tone} icon={PRIORITY_ICON[priority]} size={size} srPrefix={tu.oncelik} />;
}

export function PhaseBadge({ phase, size = 'sm' }: { phase: string; size?: 'sm' | 'md' }) {
  const tm = useTeamLabels();
  const tu = useTeamCopy().ui;
  const p = isInitiativePhase(phase) ? phase : 'later';
  const meta = tm.PHASE_META[p];
  return <StatusBadge label={meta.label} tone={meta.tone} size={size} srPrefix={tu.asama} />;
}

export function DueBadge({ dueAt, done, size = 'sm' }: { dueAt: string | null; done: boolean; size?: 'sm' | 'md' }) {
  const tf = useTeamCopy().fx;
  const tu = useTeamCopy().ui;
  const info = dueInfo(dueAt, done);
  if (!info) return null;
  return <StatusBadge label={info.label} tone={info.tone} icon={Clock3} size={size} srPrefix={tu.bitis} title={tf.dueDay(info.day)} />;
}

export function MemberAvatar({
  user,
  size = 'sm',
  className,
}: {
  user: { name: string | null; image?: string | null } | null | undefined;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const dim = size === 'xs' ? 'h-5 w-5 text-[10px]' : size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-xs';
  if (!user) {
    return (
      <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full border border-dashed border-strong text-fg-subtle', dim, className)}>
        ?
      </span>
    );
  }
  return (
    <Avatar className={cn(dim, 'shrink-0', className)}>
      {user.image ? <AvatarImage src={user.image} alt="" /> : null}
      <AvatarFallback className="bg-brand-subtle font-semibold text-brand">{getInitials(user.name || '?')}</AvatarFallback>
    </Avatar>
  );
}

/** Departman çipi: renkli nokta + nötr zemin (renkli zemin + beyaz metin AA'yı geçmiyordu). */
export function DeptChip({ slug, departments, className }: { slug: string | null; departments: TeamDepartment[]; className?: string }) {
  const tu = useTeamCopy().ui;
  if (!slug) return null;
  const d = departments.find((x) => x.slug === slug);
  return (
    <span className={cn('qx-caption inline-flex max-w-full items-center gap-1.5 rounded-chip border border-subtle bg-surface-2 px-1.5 py-0.5 text-fg-muted', className)}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d?.color ?? 'hsl(var(--muted-foreground))' }} />
      <span className="truncate">{d?.name ?? tu.kaldirilmisDepartman}</span>
    </span>
  );
}

export function TagChips({
  csv,
  pool,
  onPick,
  max = 3,
}: {
  csv: string | null;
  pool: TeamTag[];
  onPick?: (tag: string) => void;
  max?: number;
}) {
  const tf = useTeamCopy().fx;
  const tags = parseTags(csv);
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {shown.map((t) => {
        const color = pool.find((p) => p.label.toLocaleLowerCase('tr') === t.toLocaleLowerCase('tr'))?.color;
        const inner = (
          <>
            {color && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
            <span className="truncate">#{t}</span>
          </>
        );
        const cls = 'qx-caption inline-flex max-w-[9rem] items-center gap-1 rounded-chip bg-surface-2 px-1.5 py-0.5 text-fg-muted';
        return onPick ? (
          <button
            key={t}
            type="button"
            data-row-click-ignore
            onClick={(e) => {
              e.stopPropagation();
              onPick(t);
            }}
            className={cn(cls, 'hit-area hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
            aria-label={tf.filterByTag(t)}
          >
            {inner}
          </button>
        ) : (
          <span key={t} className={cls}>
            {inner}
          </span>
        );
      })}
      {tags.length > max && <span className="qx-caption text-fg-subtle">+{tags.length - max}</span>}
    </span>
  );
}

export function MetaRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5', className)}>{children}</div>;
}

export function displayName(u: { name: string | null } | null | undefined, fallback = 'Atanmamış'): string {
  if (!u) return fallback;
  return u.name || 'İsimsiz üye';
}

/** Dil duyarlı `displayName`: boş atama ve adsız üye metinleri arayüz dilinde. */
export function useDisplayName(): (u: { name: string | null } | null | undefined, fallback?: string) => string {
  const tu = useTeamCopy().ui;
  const tf = useTeamCopy().fx;
  return useCallback((u, fallback) => (u ? u.name || tf.unnamedMember : (fallback ?? tu.atanmamis)), [tu, tf]);
}
