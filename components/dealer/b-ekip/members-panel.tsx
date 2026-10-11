'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { CalendarPlus, ClipboardList, Mail, RotateCcw, Search, Star, UserCheck, UserMinus, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailSheet, KeyValueList, StatusBadge } from '@/components/ds';
import { ConfirmAction, EmptyState } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import type { MemberDto, TeamHub } from '@/lib/staff-ops/types';
import { cn } from '@/lib/utils';
import { fmtDateTime, sendJson } from './shared';
import { useTeamCopy } from './copy';
import { AttendanceBadge, FormRow, INPUT_CLS, PersonAvatar, Segmented, useHubMutation } from './parts';

type Filter = 'active' | 'inactive' | 'invited';

function fmtRating(v: number | null, locale: string): string {
  return v == null ? '—' : new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
}

export function MembersPanel({
  hub,
  onInvite,
  onOpenPerson,
}: {
  hub: TeamHub;
  onInvite: () => void;
  onOpenPerson: (userId: string, tab: 'gorevler' | 'vardiya') => void;
}) {
  const { copy, locale } = useTeamCopy();
  const c = copy.members;
  const motion = useMotionPolicy();
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      active: hub.members.filter((x) => x.isActive).length,
      inactive: hub.members.filter((x) => !x.isActive).length,
      invited: hub.invitations.length,
    }),
    [hub.members, hub.invitations]
  );

  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const list = useMemo(
    () =>
      hub.members
        .filter((x) => (filter === 'active' ? x.isActive : !x.isActive))
        .filter((x) => !needle || `${x.name ?? ''} ${x.email} ${x.jobTitle ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle)),
    [hub.members, filter, needle]
  );
  const invites = useMemo(
    () => hub.invitations.filter((i) => !needle || `${i.email} ${i.jobTitle ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle)),
    [hub.invitations, needle]
  );

  const current = hub.members.find((x) => x.staffId === openId) ?? null;

  const resend = useHubMutation((v: { email: string; jobTitle?: string }) => sendJson('/api/dealer/staff', 'POST', v), { success: c.resent });
  const revoke = useHubMutation((id: string) => sendJson(`/api/dealer/staff/invitations/${id}`, 'DELETE'), { success: c.revoked });

  if (hub.members.length === 0 && hub.invitations.length === 0) {
    return (
      <EmptyState
        icon={UserPlus}
        title={c.emptyTitle}
        description={c.emptyDesc}
        action={
          <Button onClick={onInvite} className="min-h-11">
            <UserPlus className="mr-2 h-4 w-4" aria-hidden />
            {copy.hub.invite}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Filter>
          label={copy.hub.tabs.team}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'active', label: c.filter.active, count: counts.active },
            { value: 'inactive', label: c.filter.inactive, count: counts.inactive },
            { value: 'invited', label: c.filter.invited, count: counts.invited },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={c.search}
            placeholder={c.search}
            className={cn(INPUT_CLS, 'pl-9')}
          />
        </div>
      </div>

      {filter === 'invited' ? (
        invites.length === 0 ? (
          <EmptyState variant="filtered" compact title={c.emptyFiltered} />
        ) : (
          <ul className="divide-y divide-border rounded-card border border-subtle bg-surface-1" aria-label={c.filter.invited}>
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-muted text-fg-muted">
                  <Mail className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-fg">{inv.email}</p>
                  <p className="qx-caption text-fg-muted">
                    {inv.jobTitle ? `${inv.jobTitle} · ` : ''}
                    {c.invitedRow(fmtDateTime(inv.expiresAt, locale))}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    disabled={resend.isPending}
                    onClick={() => resend.mutate({ email: inv.email, jobTitle: inv.jobTitle ?? undefined })}
                  >
                    <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
                    {c.resend}
                  </Button>
                  <ConfirmAction
                    tone="danger"
                    title={c.revokeTitle}
                    description={c.revokeDesc}
                    confirmLabel={c.revoke}
                    irreversibleNote={false}
                    onConfirm={() => revoke.mutateAsync(inv.id)}
                    trigger={
                      <Button variant="ghost" size="sm" className="min-h-11 text-danger">
                        <X className="mr-1.5 h-4 w-4" aria-hidden />
                        {c.revoke}
                      </Button>
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )
      ) : list.length === 0 ? (
        <EmptyState variant="filtered" compact title={c.emptyFiltered} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={copy.hub.tabs.team}>
          <AnimatePresence initial={false}>
            {list.map((mem) => (
              <m.li
                key={mem.staffId}
                layout={!motion.reduce}
                initial={motion.reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={motion.reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                transition={motion.transition({ duration: DURATION.base, ease: EASE.standard })}
              >
                <MemberCard member={mem} onOpen={() => setOpenId(mem.staffId)} />
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <DetailSheet
        open={!!current}
        onOpenChange={(o) => !o && setOpenId(null)}
        id={current?.staffId ?? null}
        title={current?.name ?? current?.email ?? ''}
        description={current?.jobTitle ?? undefined}
        size="md"
      >
        {current ? <MemberDetail member={current} onOpenPerson={onOpenPerson} onClose={() => setOpenId(null)} /> : null}
      </DetailSheet>
    </div>
  );
}

function MemberCard({ member, onOpen }: { member: MemberDto; onOpen: () => void }) {
  const { copy, locale } = useTeamCopy();
  const c = copy.members;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex h-full w-full flex-col gap-3 rounded-card border border-subtle bg-surface-1 p-4 text-left transition-colors duration-fast',
        'hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !member.isActive && 'opacity-80'
      )}
      aria-label={`${member.name ?? member.email} — ${c.detail}`}
    >
      <div className="flex items-center gap-3">
        <PersonAvatar name={member.name ?? member.email} image={member.image} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-fg">{member.name ?? member.email}</p>
          <p className="qx-caption truncate text-fg-muted">{member.jobTitle ?? member.email}</p>
        </div>
        {!member.isActive && <StatusBadge label={c.inactiveBadge} tone="neutral" size="sm" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {member.today ? (
          <>
            <AttendanceBadge state={member.today.state} />
            <span className="qx-caption qx-num text-fg-muted">{c.shiftToday(member.today.startTime, member.today.endTime)}</span>
          </>
        ) : (
          <span className="qx-caption text-fg-muted">{c.noShiftToday}</span>
        )}
      </div>
      <div className="qx-caption mt-auto flex items-center justify-between gap-2 text-fg-muted">
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5" aria-hidden />
          {member.feedback30.n ? c.rating(fmtRating(member.feedback30.avg, locale), member.feedback30.n) : c.noRating}
        </span>
        {member.openTasks > 0 && <span className="qx-num">{c.openTasks(member.openTasks)}</span>}
      </div>
    </button>
  );
}

function MemberDetail({
  member,
  onOpenPerson,
  onClose,
}: {
  member: MemberDto;
  onOpenPerson: (userId: string, tab: 'gorevler' | 'vardiya') => void;
  onClose: () => void;
}) {
  const { copy, locale } = useTeamCopy();
  const c = copy.member;
  const [jobTitle, setJobTitle] = useState(member.jobTitle ?? '');
  const dirty = (member.jobTitle ?? '') !== jobTitle.trim();

  const save = useHubMutation((v: { jobTitle: string | null }) => sendJson(`/api/dealer/staff/${member.staffId}`, 'PATCH', v), {
    success: copy.common.saved,
  });
  const deactivate = useHubMutation(() => sendJson(`/api/dealer/staff/${member.staffId}`, 'PATCH', { isActive: false }), {
    success: c.deactivated,
  });
  const reactivate = useHubMutation(() => sendJson(`/api/dealer/staff/${member.staffId}`, 'PATCH', { isActive: true }), {
    success: c.reactivated,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <PersonAvatar name={member.name ?? member.email} image={member.image} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-fg">{member.name ?? member.email}</p>
          <p className="qx-caption truncate text-fg-muted">{member.email}</p>
        </div>
      </div>

      <KeyValueList
        items={[
          { label: c.status, value: member.isActive ? c.active : copy.members.inactiveBadge },
          { label: c.joined, value: fmtDateTime(member.joinedAt, locale) },
          {
            label: c.feedback,
            value: member.feedback30.n
              ? copy.members.rating(fmtRating(member.feedback30.avg, locale), member.feedback30.n)
              : copy.members.noRating,
          },
          { label: c.tasks, value: String(member.openTasks) },
          { label: c.training, value: String(member.trainingDone) },
        ]}
      />

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save.mutate({ jobTitle: jobTitle.trim() || null });
        }}
      >
        <FormRow label={c.jobTitle}>
          {({ id }) => (
            <div className="flex gap-2">
              <input id={id} value={jobTitle} maxLength={50} onChange={(e) => setJobTitle(e.target.value)} className={INPUT_CLS} />
              <Button type="submit" className="min-h-11 shrink-0" disabled={!dirty || save.isPending} aria-busy={save.isPending}>
                {save.isPending ? copy.common.saving : copy.common.save}
              </Button>
            </div>
          )}
        </FormRow>
      </form>

      {member.isActive && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              onClose();
              onOpenPerson(member.userId, 'gorevler');
            }}
          >
            <ClipboardList className="mr-2 h-4 w-4" aria-hidden />
            {c.assignTask}
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              onClose();
              onOpenPerson(member.userId, 'vardiya');
            }}
          >
            <CalendarPlus className="mr-2 h-4 w-4" aria-hidden />
            {c.planShift}
          </Button>
        </div>
      )}

      <div className="space-y-2 rounded-card border border-subtle p-4">
        <p className="qx-small text-fg-muted">{c.activeHint}</p>
        {member.isActive ? (
          <ConfirmAction
            tone="danger"
            title={c.deactivateTitle(member.name ?? member.email)}
            description={c.deactivateDesc}
            confirmLabel={c.deactivate}
            irreversibleNote={false}
            onConfirm={() => deactivate.mutateAsync(undefined)}
            trigger={
              <Button variant="outline" className="min-h-11 w-full text-danger">
                <UserMinus className="mr-2 h-4 w-4" aria-hidden />
                {c.deactivate}
              </Button>
            }
          />
        ) : (
          <Button
            className="min-h-11 w-full"
            disabled={reactivate.isPending}
            aria-busy={reactivate.isPending}
            onClick={() => reactivate.mutate(undefined)}
          >
            <UserCheck className="mr-2 h-4 w-4" aria-hidden />
            {c.reactivate}
          </Button>
        )}
      </div>
    </div>
  );
}
