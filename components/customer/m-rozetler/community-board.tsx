'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, Medal, Trophy, Users } from 'lucide-react';
import { BadgeGlyph, RarityBadge } from '@/components/ds/play';
import { ChoiceChips } from '@/components/ds/a11y';
import { QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { fetchCharacterLeaderboard, type LeaderboardData, type RarestRow, type WeeklyRow } from './api';
import { formatPct, useBadgesCopy, type BadgesCopy } from './copy';

type Mode = 'rarest' | 'top-weekly';

/**
 * Topluluk sekmesi — karakter liderliği (yalnız bu sekme açılınca yüklenir).
 * "En nadir": sahip olunmayan karakterin kimliği sunucudan hiç gelmez (gizli satır).
 * "Bu hafta": adlar sunucuda maskeli ("Furkan U."), başkalarının kimliği/avatarı yok,
 * kullanıcının sırası ilk 20 dışında da gerçek.
 */
export function CommunityBoard() {
  const copy = useBadgesCopy();
  const [mode, setMode] = useState<Mode>('rarest');
  const query = useQuery({
    queryKey: ['customer', 'character-leaderboard', mode],
    queryFn: ({ signal }) => fetchCharacterLeaderboard(mode, signal),
    staleTime: 60_000,
  });

  return (
    <section aria-labelledby="topluluk-baslik" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="topluluk-baslik" className="qx-h3 flex items-center gap-2 text-fg">
          <Trophy aria-hidden className="size-5 text-brand" />
          {copy.communityTitle}
        </h2>
        <ChoiceChips<Mode>
          aria-label={copy.communityModesLabel}
          size="sm"
          options={[
            { value: 'rarest', label: copy.communityModes.rarest },
            { value: 'top-weekly', label: copy.communityModes.weekly },
          ]}
          value={mode}
          onChange={(v) => v && setMode(v)}
        />
      </div>
      <p className="qx-small text-fg-muted">{mode === 'rarest' ? copy.rarestHint : copy.weeklyHint}</p>

      <QueryState<LeaderboardData>
        query={query}
        skeleton="list"
        isEmpty={(d) => d.leaderboard.length === 0 && !(d.mode === 'top-weekly' && d.currentUser.count > 0)}
        empty={{
          icon: Users,
          title: mode === 'rarest' ? copy.rarestEmpty : copy.weeklyEmpty,
          description: copy.communityEmptyBody,
          headingLevel: 'h3',
          compact: true,
        }}
      >
        {(data) =>
          data.mode === 'rarest' ? (
            <ol className="flex flex-col gap-2">
              {data.leaderboard.map((row, i) => (
                <RarestItem key={row.rowKey} row={row} rank={i + 1} copy={copy} />
              ))}
            </ol>
          ) : (
            <div className="flex flex-col gap-3">
              <ol className="flex flex-col gap-2">
                {data.leaderboard.map((row) => (
                  <WeeklyItem key={row.rowKey} row={row} copy={copy} />
                ))}
              </ol>
              {!data.leaderboard.some((r) => r.isCurrentUser) && (
                <p className="qx-small rounded-control border border-brand-border bg-brand-subtle px-3 py-2.5 font-medium text-brand">
                  {copy.yourRank(data.currentUser.rank)}
                  {data.currentUser.count > 0 ? ` · ${copy.weeklyCount(data.currentUser.count)}` : ''}
                </p>
              )}
            </div>
          )
        }
      </QueryState>
    </section>
  );
}

function RankMark({ rank }: { rank: number }) {
  const Icon = rank === 1 ? Crown : rank <= 3 ? Medal : null;
  return (
    <span
      className={cn(
        'qx-small qx-num grid size-9 shrink-0 place-items-center rounded-full font-bold',
        rank === 1 ? 'bg-warning-subtle text-warning' : rank <= 3 ? 'bg-info-subtle text-info' : 'bg-surface-muted text-fg-muted',
      )}
    >
      {Icon ? (
        <>
          <Icon aria-hidden className="size-4" />
          <span className="sr-only">{rank}</span>
        </>
      ) : (
        rank
      )}
    </span>
  );
}

function RarestItem({ row, rank, copy }: { row: RarestRow; rank: number; copy: BadgesCopy }) {
  const pct = row.holdersPct !== null ? formatPct(row.holdersPct, copy) : null;
  return (
    <li
      className={cn(
        'flex min-h-14 items-center gap-3 rounded-control border bg-surface-1 px-3 py-2.5',
        row.isMine ? 'border-brand-border' : 'border-subtle',
      )}
    >
      <RankMark rank={rank} />
      {row.isMine && row.name ? (
        <BadgeGlyph label={row.name} imageSrc={row.thumb} color={row.category?.accent ?? undefined} rarity={row.rarity} size="md" />
      ) : (
        <BadgeGlyph label={copy.hiddenCharacter} secret size="md" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={cn('qx-small truncate font-semibold', row.isMine ? 'text-fg' : 'text-fg-muted')}>
            {row.isMine && row.name ? row.name : copy.hiddenCharacter}
          </p>
          {row.rarity !== 'common' && <RarityBadge rarity={row.rarity} locale={copy.locale} />}
          {row.isMine && (
            <span className="qx-caption rounded-chip bg-brand-subtle px-1.5 py-0.5 font-semibold text-brand">{copy.mine}</span>
          )}
        </div>
        <p className="qx-caption truncate text-fg-muted">
          {row.isMine && row.category ? `${row.category.emoji} ${row.category.name}` : copy.hiddenCharacterHint}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        {pct !== null && <span className="qx-small qx-num font-semibold text-fg">%{pct}</span>}
        <span className="qx-caption qx-num text-fg-muted">{copy.holders(row.holders)}</span>
      </div>
    </li>
  );
}

function WeeklyItem({ row, copy }: { row: WeeklyRow; copy: BadgesCopy }) {
  return (
    <li
      aria-current={row.isCurrentUser ? 'true' : undefined}
      className={cn(
        'flex min-h-14 items-center gap-3 rounded-control border px-3 py-2.5',
        row.isCurrentUser ? 'border-brand-border bg-brand-subtle' : 'border-subtle bg-surface-1',
      )}
    >
      <RankMark rank={row.rank} />
      <div className="min-w-0 flex-1">
        <p className="qx-small truncate font-semibold text-fg">
          {row.isCurrentUser ? `${copy.you}${row.name ? ` (${row.name})` : ''}` : row.name ?? copy.anonymous}
        </p>
      </div>
      <span className="qx-small qx-num shrink-0 rounded-chip bg-surface-muted px-2 py-1 font-semibold text-fg">
        {copy.weeklyCount(row.count)}
      </span>
    </li>
  );
}
