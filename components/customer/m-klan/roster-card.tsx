'use client';

import { useState } from 'react';
import { Crown, MoreVertical, UserMinus, Users } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { IconButton } from '@/components/ds/a11y';
import { ConfirmAction } from '@/components/states';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { SquadMemberDto } from '@/lib/squads/dto';
import { squadApi } from './api';
import { useKlanCopy, useKlanLocale } from './copy';
import { MemberAvatar } from './parts';
import { useConfirmRunner } from './use-klan';

type Pending = { kind: 'kick' | 'transfer'; member: SquadMemberDto } | null;

/**
 * Kadro — bu haftaki gerçek klan katkısına göre (Bulgu 8: bakiye/ "XP" / sahte "%5 katkı"
 * yerine). Lider her üye için "Lider yap" ve "Klandan çıkar" işlemlerini görür.
 */
export function RosterCard({
  squadId,
  members,
  isOwner,
  maxMembers,
  battleActive,
}: {
  squadId: string;
  members: SquadMemberDto[];
  isOwner: boolean;
  maxMembers: number;
  battleActive: boolean;
}) {
  const copy = useKlanCopy();
  const { tag } = useKlanLocale();
  const run = useConfirmRunner();
  const [pending, setPending] = useState<Pending>(null);

  return (
    <SectionCard
      title={copy.rosterTitle}
      description={copy.rosterDesc}
      icon={<Users className="h-4 w-4" aria-hidden />}
      actions={<span className="text-sm tabular-nums text-fg-muted">{copy.members(members.length, maxMembers)}</span>}
    >
      <ol className="space-y-1">
        {members.map((m, i) => (
          <li
            key={m.userId}
            className={cn(
              'flex min-h-14 items-center gap-3 rounded-xl px-2 py-2',
              m.isMe ? 'border border-brand-border bg-brand-subtle' : 'hover:bg-surface-2/60'
            )}
          >
            <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-fg-muted">{i + 1}</span>
            <MemberAvatar name={m.name} image={m.image} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-fg">{m.name}</span>
                {m.isMe ? (
                  <span className="rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-semibold leading-none text-brand-fg">{copy.you}</span>
                ) : null}
                {m.isOwner ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-warning-border px-1.5 py-0.5 text-[11px] font-semibold leading-none text-warning">
                    <Crown className="h-3 w-3" aria-hidden /> {copy.leader}
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-fg-muted">
                {copy.contributions(m.weekContributions)}
                {m.battleScore !== null ? ` · ${copy.battlePts(m.battleScore)}` : ''}
              </span>
            </span>
            <span className="shrink-0 font-display text-lg font-bold tabular-nums text-fg">{m.weekContributions.toLocaleString(tag)}</span>
            {isOwner && !m.isMe ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton aria-label={copy.memberActions(m.name)} icon={<MoreVertical className="h-4 w-4" />} variant="ghost" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setPending({ kind: 'transfer', member: m })}>
                    <Crown className="mr-2 h-4 w-4" aria-hidden /> {copy.makeLeader}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={battleActive}
                    onSelect={() => setPending({ kind: 'kick', member: m })}
                    className="text-danger focus:text-danger"
                  >
                    <UserMinus className="mr-2 h-4 w-4" aria-hidden /> {battleActive ? copy.kickLocked : copy.kick}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </li>
        ))}
      </ol>

      {pending ? (
        <ConfirmAction
          open
          onOpenChange={(o) => !o && setPending(null)}
          tone={pending.kind === 'kick' ? 'danger' : 'warning'}
          title={pending.kind === 'kick' ? copy.kickTitle(pending.member.name) : copy.transferTitle(pending.member.name)}
          description={pending.kind === 'kick' ? copy.kickBody : copy.transferBody}
          confirmLabel={pending.kind === 'kick' ? copy.kick : copy.makeLeader}
          irreversibleNote={false}
          onConfirm={() =>
            pending.kind === 'kick'
              ? run(() => squadApi.kick(squadId, pending.member.userId), () => copy.updated)
              : run(() => squadApi.transfer(squadId, pending.member.userId), () => copy.updated)
          }
        />
      ) : null}
    </SectionCard>
  );
}
