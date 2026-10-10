'use client';

import { Trophy } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { EmptyState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { SquadLeague, SquadLeagueRow } from '@/lib/squads/dto';
import { useKlanCopy, useKlanLocale } from './copy';
import { SquadEmblem } from './parts';

function Row({ row, highlight }: { row: SquadLeagueRow; highlight: boolean }) {
  const copy = useKlanCopy();
  const { tag } = useKlanLocale();
  return (
    <li
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-xl px-2.5 py-2',
        highlight ? 'border border-brand-border bg-brand-subtle' : 'odd:bg-surface-2/40'
      )}
      aria-current={highlight ? 'true' : undefined}
    >
      <span className="w-7 shrink-0 text-center font-display text-sm font-bold tabular-nums text-fg-muted">
        {row.rank <= 3 ? (
          <>
            <Trophy className={cn('mx-auto h-4 w-4', row.rank === 1 ? 'text-warning' : 'text-fg-subtle')} aria-hidden />
            <span className="sr-only">#{row.rank}</span>
          </>
        ) : (
          `#${row.rank}`
        )}
      </span>
      <SquadEmblem id={row.id} name={row.name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">{row.name}</span>
        <span className="block text-xs text-fg-muted">
          {copy.level(row.level)} · {copy.memberCount(row.memberCount)} {highlight ? `· ${copy.yourSquad}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-fg">{row.totalPoints.toLocaleString(tag)}</span>
    </li>
  );
}

export function LeagueCard({ league, discovery = false }: { league: SquadLeague; discovery?: boolean }) {
  const copy = useKlanCopy();
  const mine = league.mine;
  const mineInTop = !!mine && league.top.some((r) => r.id === mine.id);
  return (
    <SectionCard
      title={discovery ? copy.discoverTitle : copy.leagueTitle}
      description={discovery ? copy.discoverNote : copy.leagueDesc}
      icon={<Trophy className="h-4 w-4" aria-hidden />}
      density="compact"
    >
      {league.top.length === 0 ? (
        <EmptyState compact title={copy.leagueEmpty} description={null} />
      ) : (
        <ol className="space-y-1" aria-label={copy.leagueTitle}>
          {league.top.map((r) => (
            <Row key={r.id} row={r} highlight={r.id === mine?.id} />
          ))}
          {mine && !mineInTop ? (
            <>
              <li aria-hidden className="py-1 text-center text-xs text-fg-subtle">
                ⋯
              </li>
              <Row row={mine} highlight />
            </>
          ) : null}
        </ol>
      )}
    </SectionCard>
  );
}
