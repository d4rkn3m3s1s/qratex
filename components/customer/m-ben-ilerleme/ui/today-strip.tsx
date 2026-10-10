import Link from 'next/link';
import type { ReactNode } from 'react';
import { Gift, MessageSquarePlus, ScanLine } from 'lucide-react';
import { GlowCard, StreakFlame, type GlowAccent } from '@/components/ds/play';
import { routeHref } from '@/lib/navigation/registry';
import { formatNumber, getMeCopy, type MeLocale } from '../copy';
import type { ProgressSummary } from '../types';
import { SOFT_BUTTON } from './styles';
import { SectionUnavailable } from './section-unavailable';

type Card = { id: string; accent: GlowAccent; icon: ReactNode; title: string; body: string; cta?: { href: string; label: string } };

/**
 * "Bugün yapabileceklerin" — yalnız gerçek veriden türeyen, tek dokunuşla aksiyona giden
 * kartlar (eski hub'daki tıklanamayan sayaçların yerine; progress-hub bulgu 9).
 */
export function TodayStrip({ summary, locale }: { summary: ProgressSummary; locale: MeLocale }) {
  const c = getMeCopy(locale).progress;
  const n = (v: number) => formatNumber(v, locale);
  const cards: Card[] = [];
  const { streak } = summary;

  if (summary.pendingReviews && summary.pendingReviews > 0) {
    cards.push({
      id: 'pending',
      accent: 'category-3',
      icon: <MessageSquarePlus aria-hidden className="size-5" />,
      title: c.pendingTitle(n(summary.pendingReviews)),
      body: c.pendingBody,
      cta: { href: routeHref('customer.me.voices'), label: c.pendingCta },
    });
  }

  const streakTitle =
    streak.state === 'today'
      ? c.streakToday(n(streak.current))
      : streak.state === 'at_risk'
        ? c.streakAtRisk(n(streak.current))
        : streak.state === 'broken'
          ? c.streakBroken
          : c.streakNone;
  const streakBody =
    streak.state === 'today'
      ? streak.nextMilestone
        ? c.streakMilestone(n(streak.nextMilestone.days), n(streak.nextMilestone.points), n(streak.nextMilestone.remaining))
        : c.streakLongest(n(streak.longest))
      : streak.state === 'at_risk'
        ? c.streakAtRiskBody
        : c.streakBrokenBody;
  cards.push({
    id: 'streak',
    accent: streak.state === 'at_risk' ? 'warning' : 'brand',
    icon: <StreakFlame days={streak.current} showLabel={false} size="md" locale={locale} />,
    title: streakTitle,
    body: streak.longest > 0 && streak.state !== 'today' ? `${streakBody} ${c.streakLongest(n(streak.longest))}` : streakBody,
    cta: streak.state === 'today' ? undefined : { href: routeHref('customer.home'), label: c.toHome },
  });

  if (!summary.partial.includes('rewards') && summary.points.affordableCount > 0) {
    cards.push({
      id: 'rewards',
      accent: 'success',
      icon: <Gift aria-hidden className="size-5" />,
      title: c.rewardReady(n(summary.points.affordableCount)),
      body: c.rewardReadyBody,
      cta: { href: routeHref('customer.wallet.rewards'), label: c.toRewards },
    });
  }

  if (cards.length < 2) {
    cards.push({
      id: 'scan',
      accent: 'info',
      icon: <ScanLine aria-hidden className="size-5" />,
      title: c.scanCta,
      body: c.nothingToday,
      cta: { href: routeHref('customer.scan'), label: c.scanCta },
    });
  }

  return (
    <section aria-labelledby="me-progress-today" className="min-w-0 space-y-3">
      <h2 id="me-progress-today" className="qx-h3 text-fg">
        {c.todayTitle}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.id} className="min-w-0">
            <GlowCard accent={card.accent} className="flex h-full flex-col gap-3">
              <div className="flex items-start gap-3">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-subtle text-brand-text">{card.icon}</span>
                <div className="min-w-0">
                  <h3 className="qx-body font-semibold text-fg">{card.title}</h3>
                  <p className="qx-small mt-0.5 text-fg-muted">{card.body}</p>
                </div>
              </div>
              {card.cta && (
                <div className="mt-auto">
                  <Link href={card.cta.href} className={SOFT_BUTTON}>
                    {card.cta.label}
                  </Link>
                </div>
              )}
            </GlowCard>
          </li>
        ))}
      </ul>
      {summary.partial.includes('pending') && <SectionUnavailable locale={locale} compact />}
    </section>
  );
}
