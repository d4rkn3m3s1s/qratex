import Link from 'next/link';
import { ChevronRight, Sparkles } from 'lucide-react';
import { GlowCard, LeagueEmblem, PointsChip, RewardProgress, XpRing } from '@/components/ds/play';
import { routeHref } from '@/lib/navigation/registry';
import { formatNumber, getMeCopy, type MeLocale } from '../copy';
import type { ProgressSummary } from '../types';
import { SectionUnavailable } from './section-unavailable';
import { TEXT_LINK } from './styles';
import { cn } from '@/lib/utils';

/**
 * Kahraman: seviye halkası (doğru geometrik eğri) + puan bakiyesi ve en yakın gerçek ödül
 * + lig. Sunucuda çizilir; play bileşenleri kendi istemci adalarıdır.
 */
export function ProgressHero({ summary, locale }: { summary: ProgressSummary; locale: MeLocale }) {
  const c = getMeCopy(locale).progress;
  const n = (v: number) => formatNumber(v, locale);
  const { level, points, league } = summary;
  const rewardsHref = routeHref('customer.wallet.rewards');
  const leagueHref = routeHref('customer.leaderboard');
  const rewardsFailed = summary.partial.includes('rewards');

  return (
    <GlowCard className="overflow-hidden" aria-labelledby="me-progress-level-heading">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center">
        {/* Seviye */}
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <XpRing
            level={level.level}
            current={level.xpIntoLevel}
            max={level.xpForLevel}
            size={112}
            locale={locale}
            className="shrink-0"
          />
          <div className="min-w-0 space-y-1.5">
            <h2 id="me-progress-level-heading" className="qx-h2 font-display text-fg">
              {c.levelLabel(n(level.level))}
            </h2>
            <p className="qx-body text-fg">{c.xpToNext(n(level.xpToNext), n(level.level + 1))}</p>
            <p className="qx-small qx-num text-fg-muted">{c.xpOf(n(level.xpIntoLevel), n(level.xpForLevel))}</p>
            <p className="qx-caption inline-flex items-center gap-1 text-fg-muted">
              <Sparkles aria-hidden className="size-3.5 text-brand" />
              {summary.daysToNextLevel != null ? c.pace(n(summary.daysToNextLevel)) : c.paceNone}
            </p>
          </div>
        </div>

        {/* Puan + lig */}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
          <div className="min-w-0 rounded-control border border-subtle bg-surface-1/60 p-4">
            <p className="qx-caption text-fg-muted">{c.balance}</p>
            <div className="mt-1.5">
              <PointsChip value={points.balance} size="lg" locale={locale} tone="gold" />
            </div>
            <div className="mt-3 space-y-2">
              {rewardsFailed ? (
                <SectionUnavailable locale={locale} compact />
              ) : points.nextReward ? (
                <>
                  <RewardProgress
                    compact
                    current={points.balance}
                    target={points.nextReward.cost}
                    rewardLabel={points.nextReward.name}
                    locale={locale}
                  />
                  <p className="qx-caption text-fg-muted">
                    {c.nextReward(points.nextReward.name, n(points.nextReward.remaining))}
                  </p>
                </>
              ) : (
                <p className="qx-caption text-fg-muted">{c.noRewards}</p>
              )}
              {!rewardsFailed && points.affordableCount > 0 && (
                <p className="qx-caption font-medium text-success-text">{c.affordable(n(points.affordableCount))}</p>
              )}
              <Link
                href={rewardsHref}
                className={TEXT_LINK}
              >
                {c.toRewards}
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>

          <div className="min-w-0 rounded-control border border-subtle bg-surface-1/60 p-4">
            <p className="qx-caption text-fg-muted">{c.league}</p>
            {league ? (
              <>
                <div className="mt-1.5">
                  <LeagueEmblem leagueKey={league.key} name={league.name} size="md" showLabel locale={locale} />
                </div>
                <p className="qx-caption mt-3 text-fg-muted">
                  {league.next ? c.leagueNext(league.next.name, n(league.next.remaining)) : c.leagueTop}
                </p>
              </>
            ) : (
              <div className="mt-2">
                <SectionUnavailable locale={locale} compact />
              </div>
            )}
            <Link
              href={leagueHref}
              className={cn(TEXT_LINK, 'mt-1')}
            >
              {c.toLeague}
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </GlowCard>
  );
}
