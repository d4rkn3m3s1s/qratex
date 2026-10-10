'use client';

/**
 * Bağış → Topluluk: bağışçı sıralaması + son herkese açık bağışlar.
 * Denetim B1 (1–2 bağışçıda boş sekme) → esnek podyum, boş basamak "senin olabilir";
 * B3 → gerçek sıra ve "bir üst sıraya X puan" ilk 10 dışında da; B9 → maskeli ad, foto yok;
 * podyum DOM sırası 1-2-3 (görsel 2-1-3 CSS `order` ile); "Canlı" iddiası yok, elle yenile.
 */
import { useQuery } from '@tanstack/react-query';
import { Crown, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { CommunityDonor, DonationCommunity, DonorStanding } from '@/lib/customer-wallet/donate/service';
import { COMMUNITY_KEY, fetchCommunity, shouldRetry } from './api';
import { useMovesCopy, type MovesCopy } from './copy';
import { initialOf, useFormatters, type Formatters } from './format';

export function CommunityTab() {
  const { copy, locale } = useMovesCopy();
  const fmt = useFormatters(locale);
  const q = useQuery({
    queryKey: COMMUNITY_KEY,
    queryFn: ({ signal }) => fetchCommunity(signal),
    staleTime: 30_000,
    refetchOnWindowFocus: true, // PWA'ya dönüşte (ör. QR sonrası) taze veri
    retry: shouldRetry,
  });
  return (
    <QueryState query={q} skeleton="list">
      {(data) => (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => q.refetch()} disabled={q.isFetching}>
              <RefreshCw className={cn('mr-2 h-4 w-4', q.isFetching && 'animate-spin')} aria-hidden />
              {copy.refresh}
            </Button>
          </div>
          <Leaderboard data={data} fmt={fmt} copy={copy} locale={locale} />
          <Feed data={data} fmt={fmt} copy={copy} />
        </div>
      )}
    </QueryState>
  );
}

function Leaderboard({ data, fmt, copy, locale }: { data: DonationCommunity; fmt: Formatters; copy: MovesCopy; locale: 'tr' | 'en' }) {
  const board = data.leaderboard;
  const meInBoard = board.some((d) => d.isMe);
  return (
    <section aria-labelledby="donor-board-title" className="rounded-card border border-subtle bg-surface-1 p-3 sm:p-4">
      <h2 id="donor-board-title" className="qx-h3 text-fg">
        {copy.leaderboardTitle}
      </h2>
      <p className="qx-caption mt-0.5 text-fg-muted">{copy.leaderboardDesc}</p>
      {board.length === 0 ? (
        <EmptyState compact icon={Users} title={copy.leaderboardEmptyTitle} description={copy.leaderboardEmptyDesc} headingLevel="h3" />
      ) : (
        <>
          <Podium donors={board.slice(0, 3)} fmt={fmt} copy={copy} locale={locale} />
          {board.length > 3 ? (
            <ol className="mt-3 divide-y divide-subtle" start={4}>
              {board.slice(3).map((d) => (
                <DonorRow key={d.rank} d={d} fmt={fmt} copy={copy} locale={locale} />
              ))}
            </ol>
          ) : null}
        </>
      )}
      {!meInBoard ? <Standing me={data.me} fmt={fmt} copy={copy} /> : null}
    </section>
  );
}

function name(d: CommunityDonor, copy: MovesCopy): string {
  return d.isMe ? copy.you : d.name ?? copy.donorFallback;
}

function Podium({ donors, fmt, copy, locale }: { donors: CommunityDonor[]; fmt: Formatters; copy: MovesCopy; locale: 'tr' | 'en' }) {
  // DOM sırası 1-2-3; görsel 2-1-3 (`order`). Boş basamaklar davet eden yer tutucu.
  const slots = [0, 1, 2].map((i) => donors[i] ?? null);
  const order = ['order-2', 'order-1', 'order-3'];
  const heights = ['h-20', 'h-14', 'h-10'];
  return (
    <ol className="mt-4 grid grid-cols-3 items-end gap-2" aria-label={copy.leaderboardTitle}>
      {slots.map((d, i) => (
        <li key={i} className={cn('flex min-w-0 flex-col items-center gap-1.5 text-center', order[i])}>
          {d ? (
            <>
              <span className="relative">
                {i === 0 ? <Crown className="absolute -top-4 left-1/2 h-4 w-4 -translate-x-1/2 text-warning" aria-hidden /> : null}
                <span
                  aria-hidden
                  className={cn(
                    'grid h-11 w-11 place-items-center rounded-full border font-semibold',
                    d.isMe ? 'border-brand bg-brand-subtle text-brand' : 'border-subtle bg-surface-muted text-fg-muted',
                  )}
                >
                  {initialOf(d.name ?? copy.donorFallback, locale)}
                </span>
              </span>
              <span className="qx-small w-full truncate font-medium text-fg">{name(d, copy)}</span>
              <span className="qx-caption qx-num text-fg-muted">{copy.pointsShort(fmt.int(d.total))}</span>
              <span className="sr-only">{copy.rankAria(d.rank)}</span>
            </>
          ) : (
            <span className="qx-caption px-1 text-fg-subtle">{copy.podiumEmpty}</span>
          )}
          <span
            aria-hidden
            className={cn('qx-num grid w-full place-items-center rounded-t-control border border-b-0 border-subtle bg-surface-muted font-semibold text-fg-muted', heights[i])}
          >
            {i + 1}
          </span>
        </li>
      ))}
    </ol>
  );
}

function DonorRow({ d, fmt, copy, locale }: { d: CommunityDonor; fmt: Formatters; copy: MovesCopy; locale: 'tr' | 'en' }) {
  return (
    <li className={cn('flex min-h-12 items-center gap-3 px-1 py-2', d.isMe && 'rounded-control bg-brand-subtle')}>
      <span className="qx-small qx-num w-6 shrink-0 text-center text-fg-muted" aria-label={copy.rankAria(d.rank)}>
        {d.rank}
      </span>
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-muted text-sm font-semibold text-fg-muted">
        {initialOf(d.name ?? copy.donorFallback, locale)}
      </span>
      <span className="qx-small min-w-0 flex-1 truncate text-fg">
        {name(d, copy)} <span className="qx-caption text-fg-subtle">{copy.level(d.level)}</span>
      </span>
      <span className="qx-small qx-num shrink-0 font-semibold text-fg">{fmt.int(d.total)}</span>
    </li>
  );
}

function Standing({ me, fmt, copy }: { me: DonorStanding; fmt: Formatters; copy: MovesCopy }) {
  return (
    <div className="mt-4 rounded-control border border-subtle bg-surface-0 p-3">
      <p className="qx-small font-semibold text-fg">{copy.yourStanding}</p>
      {me.rank ? (
        <p className="qx-small mt-0.5 text-fg-muted">
          {copy.rankLine(fmt.int(me.rank), fmt.int(me.donors))}
          {me.gapToNext ? ` · ${copy.gapLine(fmt.int(me.gapToNext))}` : ''}
        </p>
      ) : (
        <p className="qx-caption mt-0.5 text-fg-muted">{copy.standingNone}</p>
      )}
    </div>
  );
}

function Feed({ data, fmt, copy }: { data: DonationCommunity; fmt: Formatters; copy: MovesCopy }) {
  return (
    <section aria-labelledby="donor-feed-title" className="rounded-card border border-subtle bg-surface-1 p-3 sm:p-4">
      <h2 id="donor-feed-title" className="qx-h3 text-fg">
        {copy.feedTitle}
      </h2>
      {data.feed.length === 0 ? (
        <p className="qx-small mt-2 text-fg-muted">{copy.feedEmpty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-subtle">
          {data.feed.map((a) => {
            const who = a.isMe ? copy.you : a.name ?? copy.donorFallback;
            return (
              <li key={a.id} className="flex min-h-12 items-center gap-3 py-2">
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-surface-muted text-base">
                  {a.projectIcon.length <= 8 ? a.projectIcon : '♥'}
                </span>
                <span className="qx-small min-w-0 flex-1 text-fg">
                  {copy.feedItem(who, fmt.int(a.points), a.projectName)}
                  <span className="qx-caption block text-fg-subtle">
                    <time dateTime={a.at}>{fmt.relative(a.at)}</time>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
