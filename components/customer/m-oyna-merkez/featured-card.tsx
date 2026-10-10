import Link from 'next/link';
import { ArrowRight, Dumbbell, Trophy } from 'lucide-react';
import { CountdownChip, GlowCard } from '@/components/ds/play';
import { cn } from '@/lib/utils';
import type { HubGame } from '@/lib/play-hub/catalog';
import { playHubCopy, type PlayLocale } from './copy';
import { FloatingEmoji } from './floating-emoji';
import { CHIP_CLASS, CTA_CLASS, CTA_SECONDARY_CLASS } from './styles';

/**
 * Öne çıkan oyun ("Sıradaki oyunun"): turnuva oyunu bugün denenmediyse o, değilse güne göre
 * dönen denenmemiş oyun. Hepsi denendiyse dürüst "bugünlük bitti" durumu + yenilenme sayacı.
 */
export function FeaturedCard({
  locale,
  game,
  isTournament,
  personalBest,
  resetAt,
  practiceHref,
}: {
  locale: PlayLocale;
  game: HubGame | null;
  isTournament: boolean;
  personalBest: number | null;
  resetAt: string | null;
  /** Bugünlük bitti durumunda pratik önerisi (pratik destekli oyun varsa). */
  practiceHref: string | null;
}) {
  const c = playHubCopy(locale);

  if (!game) {
    return (
      <GlowCard accent="success" className="flex flex-col gap-3">
        <p className="qx-overline text-success">{c.featuredEyebrow}</p>
        <h2 className="qx-h2 text-fg">{c.featuredAllDoneTitle}</h2>
        <p className="qx-body text-fg-muted">{c.featuredAllDoneBody}</p>
        <div className="flex flex-wrap items-center gap-2">
          {resetAt && <CountdownChip target={resetAt} label={c.resetIn} locale={locale} />}
          {practiceHref && (
            <Link href={practiceHref} className={CTA_SECONDARY_CLASS}>
              <Dumbbell className="size-4" aria-hidden />
              {c.practiceCta}
            </Link>
          )}
        </div>
      </GlowCard>
    );
  }

  return (
    <GlowCard
      accent={{ from: game.accent, to: 'hsl(var(--gradient-to))' }}
      padded={false}
      className="relative overflow-hidden"
    >
      {/* Oyunun kimlik rengiyle yumuşak hale — yalnız dekoratif (metin rengi token'dan). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(90% 120% at 100% 0%, color-mix(in oklab, ${game.accent} 28%, transparent), transparent 65%)`,
        }}
      />
      <div className="relative flex flex-col gap-4 p-card sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <FloatingEmoji emoji={game.emoji} className="text-6xl sm:text-7xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex items-center gap-1.5 qx-overline text-brand">
            {isTournament && <Trophy className="size-3.5" aria-hidden />}
            {isTournament ? c.featuredTournamentEyebrow : c.featuredEyebrow}
          </p>
          <h2 className="qx-h2 text-fg">{game.title}</h2>
          <p className="qx-body text-fg-muted">{game.description}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className={CHIP_CLASS}>{c.rewardChip(game.rewardPoints, game.rewardXp)}</span>
            <span className={CHIP_CLASS}>{c.thresholdChip(game.rewardThreshold, game.maxScore)}</span>
            {personalBest != null && personalBest > 0 && <span className={CHIP_CLASS}>{c.personalBest(personalBest)}</span>}
          </div>
        </div>
        <Link href={game.href} className={cn(CTA_CLASS, 'w-full sm:w-auto')} aria-label={`${game.title} — ${c.featuredCta}`}>
          {c.featuredCta}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </GlowCard>
  );
}
