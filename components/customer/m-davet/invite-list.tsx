'use client';

import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { m as Motion } from 'framer-motion';
import { Bell, CheckCircle2, Circle, Clock, Hourglass, Loader2, RefreshCw, Share2, Users, XCircle } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { announce } from '@/components/ds/a11y';
import { EmptyState, ErrorState, InlineError, SkeletonList } from '@/components/states';
import { listItem, useMotionPolicy } from '@/lib/motion';
import { moments } from '@/lib/moments/client';
import { cn } from '@/lib/utils';
import {
  InviteApiError,
  fetchInviteRows,
  inviteKeys,
  nudgeInviteRow,
  type InviteRow,
  type InviteRowsPage,
} from './invite-api';
import { errorText, formatDay, formatDayTime, formatPoints, useInviteCopy } from './copy';

type Rows = InfiniteData<InviteRowsPage, string | null>;

const STATUS_STYLE: Record<InviteRow['status'], { icon: typeof CheckCircle2; cls: string }> = {
  COMPLETED: { icon: CheckCircle2, cls: 'border-success-border bg-success-subtle text-success' },
  PENDING: { icon: Hourglass, cls: 'border-warning-border bg-warning-subtle text-warning' },
  EXPIRED: { icon: XCircle, cls: 'border-subtle bg-surface-3 text-fg-muted' },
};

function Step({ done, label, doneText, todoText }: { done: boolean; label: string; doneText: string; todoText: string }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className={cn('qx-caption flex items-center gap-1', done ? 'text-success' : 'text-fg-muted')}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span>{label}</span>
      <span className="sr-only">: {done ? doneText : todoText}</span>
    </li>
  );
}

export function InviteList({
  initial,
  onShare,
  onChanged,
  applyWindowDays,
}: {
  initial: InviteRowsPage;
  onShare: () => void;
  /** Davet durumu değişti (ör. "kontrol et" ile tamamlandı) → özet tazelensin. */
  onChanged: () => void;
  applyWindowDays: number;
}) {
  const { copy, locale } = useInviteCopy();
  const policy = useMotionPolicy();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: inviteKeys.rows,
    queryFn: ({ pageParam }) => fetchInviteRows(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: { pages: [initial], pageParams: [null] },
    staleTime: 30_000,
  });

  const patchRow = (id: string, patch: Partial<InviteRow>) => {
    qc.setQueryData<Rows>(inviteKeys.rows, (old) =>
      old
        ? { ...old, pages: old.pages.map((p) => ({ ...p, rows: p.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })) }
        : old
    );
  };

  const nudge = useMutation({
    mutationFn: (row: InviteRow) => nudgeInviteRow(row.id),
    onMutate: (row) => setBusyId(row.id),
    onSettled: () => setBusyId(null),
    onSuccess: (result, row) => {
      if (result.kind === 'nudged') {
        patchRow(row.id, { action: null, nudgeBlockedBy: 'RECENTLY_NUDGED', nudgeAvailableAt: result.nextAt });
        toast.success(copy.nudgeSent);
        announce(copy.nudgeSent);
      } else {
        const pts = formatPoints(result.points, locale);
        if (!moments.points({ points: result.points })) toast.success(copy.checkQualified(pts));
        announce(copy.checkQualified(pts));
        onChanged();
      }
    },
    onError: (err, row) => {
      const e = err instanceof InviteApiError ? err : null;
      const msg = errorText(copy, e?.code, e?.message || copy.actionError, { applyWindowDays });
      if (e?.code === 'RECENTLY_NUDGED') {
        const nextAt = (e.details as { nextAt?: string } | undefined)?.nextAt ?? null;
        patchRow(row.id, { action: null, nudgeBlockedBy: 'RECENTLY_NUDGED', nudgeAvailableAt: nextAt });
      } else if (e?.code === 'NOT_PENDING' || e?.code === 'NOT_QUALIFIED') {
        onChanged();
      }
      toast.error(msg);
    },
  });

  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <SectionCard title={copy.listTitle} description={copy.listDesc} icon={<Users />}>
      {query.isError && rows.length === 0 ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          variant="first-use"
          compact
          title={copy.emptyTitle}
          description={copy.emptyDesc}
          action={
            <Button type="button" onClick={onShare} className="min-h-11">
              <Share2 aria-hidden className="mr-2 size-4" />
              {copy.shareLink}
            </Button>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {rows.map((row, i) => {
              const style = STATUS_STYLE[row.status];
              const StatusIcon = style.icon;
              const statusLabel =
                row.status === 'COMPLETED' ? copy.statusCompleted : row.status === 'PENDING' ? copy.statusPending : copy.statusExpired;
              const busy = busyId === row.id && nudge.isPending;
              return (
                <Motion.li
                  key={row.id}
                  variants={policy.variants(listItem)}
                  initial={i < 12 ? 'hidden' : false}
                  animate="visible"
                  custom={i < 12 ? i : undefined}
                  className="py-3 first:pt-1 last:pb-1"
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-subtle text-sm font-bold text-brand"
                    >
                      {row.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <p className="truncate font-medium text-fg">{row.name ?? copy.friend}</p>
                        <span className={cn('qx-caption inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 font-medium', style.cls)}>
                          <StatusIcon aria-hidden className="size-3.5" />
                          {statusLabel}
                          {row.status === 'COMPLETED' && row.pointsEarned > 0 && (
                            <span className="tabular-nums">· {copy.earnedPoints(formatPoints(row.pointsEarned, locale))}</span>
                          )}
                        </span>
                      </div>
                      <p className="qx-caption text-fg-muted">{copy.invitedOn(formatDay(row.createdAt, locale))}</p>

                      {row.status !== 'COMPLETED' && (
                        <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label={statusLabel}>
                          <Step done label={copy.stepJoined} doneText={copy.stepDone} todoText={copy.stepTodo} />
                          <Step done={row.steps.verified} label={copy.stepVerified} doneText={copy.stepDone} todoText={copy.stepTodo} />
                          <Step done={row.steps.firstQr} label={copy.stepFirstQr} doneText={copy.stepDone} todoText={copy.stepTodo} />
                        </ol>
                      )}

                      {row.status === 'PENDING' && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          {row.expiresAt && (
                            <p className="qx-caption flex items-center gap-1 text-fg-muted">
                              <Clock aria-hidden className="size-3.5" />
                              {copy.expiresOn(formatDay(row.expiresAt, locale))}
                            </p>
                          )}
                          {row.action === 'nudge' && (
                            <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={busy} onClick={() => nudge.mutate(row)}>
                              {busy ? <Loader2 aria-hidden className="mr-1.5 size-4 animate-spin motion-reduce:animate-none" /> : <Bell aria-hidden className="mr-1.5 size-4" />}
                              {copy.nudge}
                              <span className="sr-only">: {row.name ?? copy.friend}</span>
                            </Button>
                          )}
                          {row.action === 'check' && (
                            <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={busy} onClick={() => nudge.mutate(row)}>
                              {busy ? <Loader2 aria-hidden className="mr-1.5 size-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden className="mr-1.5 size-4" />}
                              {copy.check}
                              <span className="sr-only">: {row.name ?? copy.friend}</span>
                            </Button>
                          )}
                          {row.nudgeBlockedBy === 'NOT_VERIFIED' && <p className="qx-caption w-full text-fg-muted">{copy.nudgeNeedsVerify}</p>}
                          {row.nudgeBlockedBy === 'RECENTLY_NUDGED' && row.nudgeAvailableAt && (
                            <p className="qx-caption text-fg-muted">{copy.nudgeNext(formatDayTime(row.nudgeAvailableAt, locale))}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Motion.li>
              );
            })}
          </ul>

          {query.isFetchingNextPage && <SkeletonList rows={2} className="mt-3" />}
          {query.isError && rows.length > 0 && (
            <InlineError variant="banner" className="mt-3" onRetry={() => query.fetchNextPage()}>
              {copy.actionError}
            </InlineError>
          )}
          {query.hasNextPage && !query.isFetchingNextPage && (
            <div className="mt-3 flex justify-center">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => query.fetchNextPage()}>
                {copy.loadMore}
              </Button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
