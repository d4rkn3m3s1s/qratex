'use client';

import { Crown, History, LogIn, LogOut, Pencil, RefreshCw, Swords, Target, Trophy, UserMinus, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { EmptyState } from '@/components/states';
import type { SquadActivityDto } from '@/lib/squads/dto';
import { useKlanCopy, useKlanLocale } from './copy';
import { relativeTime } from './parts';

const ICONS: Record<SquadActivityDto['kind'], LucideIcon> = {
  created: Crown,
  joined: LogIn,
  left: LogOut,
  kicked: UserMinus,
  leader: Crown,
  renamed: Pencil,
  invite_rotated: RefreshCw,
  goal_changed: Target,
  challenge_sent: Swords,
  challenge_received: Swords,
  battle_started: Swords,
  battle_won: Trophy,
  battle_lost: Swords,
  battle_draw: Swords,
  battle_cancelled: XCircle,
};

/** Klan günlüğü — gerçek kayıtlar (üyelik, AuditLog, savaş satırları); 30 gün. */
export function ActivityCard({ items }: { items: SquadActivityDto[] }) {
  const copy = useKlanCopy();
  const { tag } = useKlanLocale();
  return (
    <SectionCard title={copy.activityTitle} icon={<History className="h-4 w-4" aria-hidden />} density="compact">
      {items.length === 0 ? (
        <EmptyState compact title={copy.activityEmpty} description={null} />
      ) : (
        <ol className="space-y-2.5">
          {items.map((a) => {
            const Icon = ICONS[a.kind];
            const actor = a.actor ?? '—';
            const text =
              a.kind === 'renamed'
                ? copy.activity.renamed(actor, a.detail ?? '')
                : (copy.activity[a.kind] as (who: string) => string)(actor);
            return (
              <li key={a.id} className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={
                    a.kind === 'battle_won'
                      ? 'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-success-subtle text-success'
                      : 'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-muted'
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-fg">{text}</span>
                  <time dateTime={a.at} className="block text-xs text-fg-subtle" suppressHydrationWarning>
                    {relativeTime(a.at, tag)}
                  </time>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
