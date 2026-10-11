import Link from 'next/link';
import { ArrowRight, Crown, Gift, Medal, Trophy, Users } from 'lucide-react';
import { CountdownChip, GlowCard } from '@/components/ds/play';
import { EmptyState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { MyWeekRow, Settled, TournamentSummary } from '@/lib/play-hub/server';
import { playHubCopy, type PlayLocale } from './copy';
import { ClaimButton } from './claim-button';
import { CHIP_CLASS, CTA_CLASS, CTA_SECONDARY_CLASS } from './styles';
import { SectionError } from './section-error';

/** Geçen haftanın bekleyen turnuva ödülü — lobinin en üstünde tek, öncelikli uyarı. */
export function PendingRewardBanner({
  locale,
  pending,
}: {
  locale: PlayLocale;
  pending: NonNullable<TournamentSummary['pendingReward']>;
}) {
  const c = playHubCopy(locale);
  return (
    <GlowCard accent="warning" className="flex flex-col gap-3 sm:flex-row sm:items-center" role="region" aria-label={c.pendingTitle}>
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-control bg-warning-subtle text-warning">
        <Gift className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="qx-h3 text-fg">{c.pendingTitle}</h2>
        <p className="qx-small text-fg-muted">{c.pendingBody(pending.gameTitle, pending.rank, pending.points)}</p>
      </div>
      <ClaimButton
        endpoint="/api/customer/tournament"
        label={c.pendingCta}
        pendingLabel={c.pendingClaiming}
        successMessage={c.pendingDone(pending.points)}
      />
    </GlowCard>
  );
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="size-4 text-warning" aria-hidden />;
  if (rank <= 3) return <Medal className="size-4 text-brand" aria-hidden />;
  return null;
}

/** Oyunlar sekmesindeki kompakt haftalık turnuva kartı. */
export function TournamentCard({ locale, data }: { locale: PlayLocale; data: Settled<TournamentSummary> }) {
  const c = playHubCopy(locale);
  return (
    <GlowCard accent="category-4" className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 qx-h3 text-fg">
          <Trophy className="size-5 text-warning" aria-hidden />
          {c.tournamentTitle}
        </h2>
        {data.ok && <CountdownChip target={data.data.endsAt} label={c.tournamentEndsIn} size="sm" locale={locale} />}
      </div>
      {!data.ok ? (
        <SectionError locale={locale} kind={data.error} className="p-0" />
      ) : !data.data.featured ? (
        <p className="qx-small text-fg-muted">{c.tournamentNone}</p>
      ) : (
        <>
          <p className="flex items-center gap-2 qx-body font-semibold text-fg">
            <span aria-hidden className="text-2xl leading-none">
              {data.data.featured.emoji}
            </span>
            {data.data.featured.title}
          </p>
          <p className="qx-small text-fg-muted">
            {data.data.me ? c.tournamentMyRank(data.data.me.rank, data.data.me.score) : c.tournamentNoRank}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className={CHIP_CLASS}>
              <Users className="size-3.5" aria-hidden />
              {c.tournamentPlayers(data.data.totalPlayers)}
            </span>
          </div>
          <p className="qx-caption text-fg-muted">
            {data.data.prizesActive ? c.tournamentPrizes : c.tournamentNeeded(data.data.participantsNeeded)}
          </p>
          {!data.data.featured.href && <p className="qx-caption text-warning">{c.tournamentUnlisted}</p>}
          <Link href="/customer/games?tab=tournament" className={cn(CTA_SECONDARY_CLASS, 'mt-auto')}>
            {c.tournamentDetails}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </>
      )}
    </GlowCard>
  );
}

/** Turnuva sekmesi: öne çıkan oyun, ödüller, ilk 10 + "sen", bu haftaki kişisel skorlar, kurallar. */
export function TournamentBoard({
  locale,
  data,
  myWeek,
}: {
  locale: PlayLocale;
  data: Settled<TournamentSummary>;
  myWeek: Settled<MyWeekRow[]>;
}) {
  const c = playHubCopy(locale);
  if (!data.ok) return <SectionError locale={locale} kind={data.error} />;
  const t = data.data;
  const meOutsideTop = !!t.me && t.me.rank > t.leaderboard.length;

  return (
    <div className="space-y-section">
      {t.pendingReward && <PendingRewardBanner locale={locale} pending={t.pendingReward} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <GlowCard
          accent={t.featured ? { from: t.featured.accent, to: 'hsl(var(--gradient-to))' } : 'brand'}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 qx-overline text-brand">
              <Trophy className="size-3.5" aria-hidden />
              {c.featuredTournamentEyebrow} · {t.weekKey}
            </p>
            <CountdownChip target={t.endsAt} label={c.tournamentEndsIn} size="sm" locale={locale} />
          </div>
          {t.featured ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span aria-hidden className="text-6xl leading-none">
                {t.featured.emoji}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="qx-h2 text-fg">{t.featured.title}</h2>
                <p className="qx-small text-fg-muted">
                  {t.me ? c.tournamentMyRank(t.me.rank, t.me.score) : c.tournamentNoRank}
                </p>
                <p className={cn('qx-small', t.prizesActive ? 'text-success' : 'text-warning')}>
                  {t.prizesActive ? c.tournamentPrizes : c.tournamentNeeded(t.participantsNeeded)}
                </p>
                {!t.featured.href && <p className="qx-small text-warning">{c.tournamentUnlisted}</p>}
              </div>
              {t.featured.href && (
                <Link href={t.featured.href} className={cn(CTA_CLASS, 'w-full sm:w-auto')}>
                  {c.playCta}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </div>
          ) : (
            <p className="qx-body text-fg-muted">{c.tournamentNone}</p>
          )}
          <ul className="grid grid-cols-3 gap-2" aria-label={c.tTabPrizeCol}>
            {t.prizes.map((p) => (
              <li
                key={p.rank}
                className="flex flex-col items-center gap-1 rounded-control border border-border bg-surface-1 p-3 text-center"
              >
                <RankIcon rank={p.rank} />
                <span className="qx-caption text-fg-muted">{p.rank}.</span>
                <span className="qx-small font-semibold qx-num text-fg">{c.points(p.points)}</span>
              </li>
            ))}
          </ul>
        </GlowCard>

        <section aria-labelledby="t-rules" className="rounded-card border border-border bg-surface-1 p-card">
          <h2 id="t-rules" className="qx-h3 text-fg">
            {c.tTabRules}
          </h2>
          <p className="mt-2 qx-small text-fg-muted">{c.tTabRulesBody(t.minParticipants)}</p>
        </section>
      </div>

      <section aria-labelledby="t-board" className="rounded-card border border-border bg-surface-1 p-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="t-board" className="qx-h3 text-fg">
            {c.tTabLeaderboard}
          </h2>
          <span className={CHIP_CLASS}>
            <Users className="size-3.5" aria-hidden />
            {c.tournamentPlayers(t.totalPlayers)}
          </span>
        </div>
        {t.leaderboard.length === 0 ? (
          <EmptyState variant="first-use" title={c.tTabEmpty} compact headingLevel="p" />
        ) : (
          <table className="w-full table-fixed qx-small">
            <caption className="sr-only">{c.tTabLeaderboard}</caption>
            <thead className="text-left text-fg-muted">
              <tr>
                <th scope="col" className="w-14 py-2 font-medium">
                  {c.tTabRankCol}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {c.tTabPlayerCol}
                </th>
                <th scope="col" className="w-16 py-2 text-right font-medium">
                  {c.tTabScoreCol}
                </th>
                <th scope="col" className="w-24 py-2 text-right font-medium">
                  {c.tTabPrizeCol}
                </th>
              </tr>
            </thead>
            <tbody>
              {t.leaderboard.map((r) => (
                <tr key={r.rank} className={cn('border-t border-border', r.isMe && 'bg-brand-subtle')}>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1 qx-num font-semibold text-fg">
                      <RankIcon rank={r.rank} />
                      {r.rank}
                    </span>
                  </td>
                  <td className="truncate py-2.5 text-fg">
                    {r.name}
                    {r.isMe && <span className="ml-1.5 qx-caption font-semibold text-brand">({c.tTabYou})</span>}
                  </td>
                  <td className="py-2.5 text-right qx-num font-semibold text-fg">{r.score}</td>
                  <td className="py-2.5 text-right qx-num text-fg-muted">
                    {r.prize > 0 && t.prizesActive ? c.points(r.prize) : '—'}
                  </td>
                </tr>
              ))}
              {meOutsideTop && t.me && (
                <tr className="border-t-2 border-strong bg-brand-subtle">
                  <td className="py-2.5 qx-num font-semibold text-fg">{t.me.rank}</td>
                  <td className="py-2.5 font-semibold text-brand">{c.tTabYou}</td>
                  <td className="py-2.5 text-right qx-num font-semibold text-fg">{t.me.score}</td>
                  <td className="py-2.5 text-right text-fg-muted">—</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="t-myweek" className="rounded-card border border-border bg-surface-1 p-card">
        <h2 id="t-myweek" className="mb-3 qx-h3 text-fg">
          {c.tTabMyWeek}
        </h2>
        {!myWeek.ok ? (
          <SectionError locale={locale} kind={myWeek.error} className="p-0" />
        ) : myWeek.data.length === 0 ? (
          <p className="qx-small text-fg-muted">{c.tTabMyWeekEmpty}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {myWeek.data.map((g) => {
              const body = (
                <>
                  <span aria-hidden className="text-2xl leading-none">
                    {g.emoji}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-fg">{g.title}</span>
                  <span className="qx-num font-semibold text-fg">{g.best}</span>
                </>
              );
              return (
                <li key={g.gameType}>
                  {g.href ? (
                    <Link
                      href={g.href}
                      className="flex min-h-11 items-center gap-3 rounded-control border border-border bg-surface-1 px-3 py-2 qx-small transition-colors duration-fast ease-standard hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex min-h-11 items-center gap-3 rounded-control border border-border px-3 py-2 qx-small">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
