'use client';

import { AnimatePresence, m } from 'framer-motion';
import { AlertTriangle, Check, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmAction, EmptyState } from '@/components/states';
import { SectionCard } from '@/components/ds';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import type { LeaveDto, TeamHub } from '@/lib/staff-ops/types';
import { fmtDay, fmtRelative, sendJson } from './shared';
import { useTeamCopy } from './copy';
import { LeaveStatusBadge, PersonAvatar, useHubMutation } from './parts';

export function ApprovalsPanel({ hub }: { hub: TeamHub }) {
  const { copy } = useTeamCopy();
  const c = copy.approvals;
  const motion = useMotionPolicy();
  const pending = hub.leave.filter((l) => l.status === 'pending');
  const history = hub.leave.filter((l) => l.status !== 'pending');

  return (
    <div className="space-y-6">
      <section aria-labelledby="ekip-onay-baslik" className="space-y-3">
        <h3 id="ekip-onay-baslik" className="qx-h3 text-fg">
          {c.pendingTitle}
        </h3>
        {pending.length === 0 ? (
          <EmptyState compact icon={CheckCircle2} title={c.emptyTitle} description={c.emptyDesc} />
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {pending.map((l) => (
                <m.li
                  key={l.id}
                  layout={!motion.reduce}
                  initial={motion.reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={motion.reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
                  transition={motion.transition({ duration: DURATION.base, ease: EASE.standard })}
                >
                  <LeaveCard leave={l} />
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <SectionCard title={c.historyTitle}>
          <ul className="divide-y divide-border">
            {history.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <PersonAvatar name={l.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{l.name ?? copy.common.unknown}</span>
                  <RangeText leave={l} />
                </span>
                <LeaveStatusBadge status={l.status} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

function RangeText({ leave }: { leave: LeaveDto }) {
  const { copy, locale } = useTeamCopy();
  const s = fmtDay(leave.startDate, locale);
  const e = fmtDay(leave.endDate, locale);
  return (
    <span className="qx-caption qx-num block text-fg-muted">
      {leave.startDate === leave.endDate ? s : `${s} – ${e}`} · {copy.approvals.days(leave.days)}
    </span>
  );
}

function LeaveCard({ leave }: { leave: LeaveDto }) {
  const { copy, locale } = useTeamCopy();
  const c = copy.approvals;
  const approve = useHubMutation(() => sendJson(`/api/dealer/staff/leave?id=${encodeURIComponent(leave.id)}`, 'PATCH', { status: 'approved' }), {
    success: c.approved,
  });
  const reject = useHubMutation(() => sendJson(`/api/dealer/staff/leave?id=${encodeURIComponent(leave.id)}`, 'PATCH', { status: 'rejected' }), {
    success: c.rejected,
  });
  const busy = approve.isPending || reject.isPending;
  return (
    <div className="flex flex-col gap-3 rounded-card border border-subtle bg-surface-1 p-4 sm:flex-row sm:items-start">
      <PersonAvatar name={leave.name} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold text-fg">{leave.name ?? copy.common.unknown}</p>
        <RangeText leave={leave} />
        {leave.reason && (
          <p className="qx-small text-fg">
            <span className="text-fg-muted">{c.reason}: </span>
            {leave.reason}
          </p>
        )}
        <p className={`qx-caption flex items-center gap-1 ${leave.conflictingShifts ? 'font-medium text-warning' : 'text-fg-muted'}`}>
          {leave.conflictingShifts ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : null}
          {leave.conflictingShifts ? c.conflicts(leave.conflictingShifts) : c.noConflicts}
        </p>
        <p className="qx-caption text-fg-subtle">{fmtRelative(leave.createdAt, locale)}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <ConfirmAction
          tone="danger"
          title={`${c.reject}: ${leave.name ?? ''}`}
          confirmLabel={c.reject}
          irreversibleNote={false}
          onConfirm={() => reject.mutateAsync(undefined)}
          trigger={
            <Button variant="outline" className="min-h-11 text-danger" disabled={busy}>
              <X className="mr-1.5 h-4 w-4" aria-hidden />
              {c.reject}
            </Button>
          }
        />
        <Button className="min-h-11" disabled={busy} aria-busy={approve.isPending} onClick={() => approve.mutate(undefined)}>
          <Check className="mr-1.5 h-4 w-4" aria-hidden />
          {c.approve}
        </Button>
      </div>
    </div>
  );
}
