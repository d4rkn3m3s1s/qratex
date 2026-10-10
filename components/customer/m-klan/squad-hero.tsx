'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, MoreHorizontal, Settings2, ShieldAlert, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ds/a11y';
import { GlowCard } from '@/components/ds/play';
import { ConfirmAction } from '@/components/states';
import type { SquadMemberDto, SquadOverviewMember } from '@/lib/squads/dto';
import { squadApi } from './api';
import { useKlanCopy } from './copy';
import { MemberAvatar, SquadEmblem, squadAccent } from './parts';
import { InviteSheet } from './invite-sheet';
import { SettingsSheet } from './settings-sheet';
import { useErrorText, useRefreshSquad } from './use-klan';

function leaveImpact(
  copy: ReturnType<typeof useKlanCopy>,
  members: SquadMemberDto[],
  isOwner: boolean,
  inActiveBattle: boolean
): string[] {
  const out: string[] = [];
  const others = members.filter((m) => !m.isMe).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  if (others.length === 0) out.push(copy.leaveImpactLast);
  else if (isOwner) out.push(copy.leaveImpactOwner(others[0].name));
  else out.push(copy.leaveImpactMember);
  if (inActiveBattle) out.push(copy.leaveImpactBattle);
  return out;
}

/** Klan kimlik başlığı (vizyon madde 1): amblem, ad, slogan, seviye, kapasite, sıra, davet, yönetim. */
export function SquadHero({ data }: { data: SquadOverviewMember }) {
  const copy = useKlanCopy();
  const router = useRouter();
  const errorText = useErrorText();
  const refresh = useRefreshSquad();
  const { squad, members, viewer, league, battle } = data;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const inActiveBattle = battle.battle?.status === 'active' && battle.battle.amParticipant;
  const accent = squadAccent(squad.id);

  return (
    <GlowCard accent={accent} className="space-y-4">
      {squad.isFrozen ? (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-warning-border bg-warning-subtle p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-semibold text-fg">{copy.frozenTitle}</p>
            <p className="text-fg-muted">{copy.frozenBody}</p>
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-3 sm:gap-4">
        <SquadEmblem id={squad.id} name={squad.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{copy.eyebrow}</p>
          <h1 className="text-balance break-words font-display text-2xl font-bold text-fg sm:text-3xl">{squad.name}</h1>
          {squad.description ? <p className="mt-1 text-pretty text-sm text-fg-muted">{squad.description}</p> : null}
          <ul className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium">
            <li className="rounded-full bg-brand-subtle px-2.5 py-1 text-brand-text">{copy.level(squad.level)}</li>
            <li className="rounded-full bg-surface-2 px-2.5 py-1 text-fg-muted">{copy.members(squad.memberCount, squad.maxMembers)}</li>
            {league.mine ? (
              <li className="rounded-full bg-surface-2 px-2.5 py-1 text-fg-muted">{copy.rankOf(league.mine.rank, league.total)}</li>
            ) : null}
          </ul>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label={copy.more} icon={<MoreHorizontal className="h-5 w-5" />} variant="ghost" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {viewer.isOwner ? (
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <Settings2 className="mr-2 h-4 w-4" aria-hidden /> {copy.manage}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => setLeaveOpen(true)} className="text-danger focus:text-danger">
              <LogOut className="mr-2 h-4 w-4" aria-hidden /> {copy.leave}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ul className="flex -space-x-2" aria-label={copy.rosterTitle}>
          {members.slice(0, 8).map((m) => (
            <li key={m.userId} title={m.name}>
              <MemberAvatar name={m.name} image={m.image} size={36} className="ring-2 ring-surface-1" />
              <span className="sr-only">{m.name}</span>
            </li>
          ))}
          {members.length > 8 ? (
            <li className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-fg-muted ring-2 ring-surface-1">
              +{members.length - 8}
            </li>
          ) : null}
        </ul>
        <div className="flex gap-2">
          <Button onClick={() => setInviteOpen(true)} className="flex-1 sm:flex-none" disabled={squad.isFrozen}>
            <UserPlus className="h-4 w-4" aria-hidden /> {copy.invite}
          </Button>
          {viewer.isOwner ? (
            <Button variant="outline" onClick={() => setSettingsOpen(true)} className="flex-1 sm:flex-none">
              <Settings2 className="h-4 w-4" aria-hidden /> {copy.manage}
            </Button>
          ) : null}
        </div>
      </div>

      <InviteSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        squadName={squad.name}
        code={squad.inviteCode}
        memberCount={squad.memberCount}
        maxMembers={squad.maxMembers}
      />
      {viewer.isOwner ? (
        <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} squad={squad} goalTier={data.weeklyGoal.tier} />
      ) : null}
      <ConfirmAction
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        tone="danger"
        title={copy.leaveTitle}
        impact={{ items: leaveImpact(copy, members, viewer.isOwner, inActiveBattle).map((t) => ({ label: t, value: '' })) }}
        confirmLabel={copy.leaveConfirm}
        irreversibleNote={false}
        onConfirm={async () => {
          let r: { result: string; message: string };
          try {
            r = await squadApi.leave(squad.id);
          } catch (err) {
            throw new Error(errorText(err));
          }
          toast.success(copy.leftResult[r.result] ?? r.message);
          await refresh();
          router.refresh();
        }}
      />
    </GlowCard>
  );
}
