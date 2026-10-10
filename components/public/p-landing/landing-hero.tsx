import Link from 'next/link';
import { ArrowRight, ScanLine, Sparkles, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CtaLink } from './cta-link';
import { HeroStory } from './hero-story';
import type { LandingCopy } from './landing-copy';

/**
 * Ana sayfa hero'su (sunucu bileşeni). LCP öğesi olan başlık ilk HTML'de tam opak basılır
 * (giriş animasyonu yok, istemci JS beklemez); vurgu kelimesi statik CSS gradyanı.
 * İki kitle tek bakışta: birincil CTA tüketici kaydı, ikincil CTA işletme sayfası.
 */
export function LandingHero({
  copy,
  story,
  points,
  xp,
  pointsLabel,
  xpLabel,
}: {
  copy: LandingCopy['hero'];
  story: LandingCopy['story'];
  points: string;
  xp: string;
  pointsLabel: string;
  xpLabel: string;
}) {
  return (
    <section aria-labelledby="hero-title" className="relative px-4 pb-14 pt-28 sm:px-6 sm:pt-32 lg:pb-20">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
        <div className="text-center lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-subtle px-3 py-1 text-sm font-medium text-brand">
            <Sparkles className="h-4 w-4" aria-hidden />
            {copy.eyebrow}
          </p>
          <h1
            id="hero-title"
            className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-6xl lg:leading-[1.05]"
          >
            {copy.titleLead} <span className="text-gradient">{copy.titleAccent}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg lg:mx-0">
            {copy.sub}
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
            <Button asChild size="lg" variant="gradient" className="px-7">
              <CtaLink href="/auth/register?role=CUSTOMER&src=landing_hero" cta="hero_join" page="landing">
                {copy.ctaPrimary}
                <ArrowRight className="h-5 w-5" aria-hidden />
              </CtaLink>
            </Button>
            <Button asChild size="lg" variant="outline" className="px-7">
              <CtaLink href="/neden-qratex" cta="hero_business" page="landing">
                <Store className="h-5 w-5" aria-hidden />
                {copy.ctaBusiness}
              </CtaLink>
            </Button>
          </div>
          <p className="mt-5 text-sm text-fg-muted">
            {copy.loginPrompt}{' '}
            <Link
              href="/auth/login"
              className="inline-flex min-h-11 items-center rounded-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copy.loginLink}
            </Link>
          </p>
          <p className="mx-auto mt-1 flex max-w-xl items-start justify-center gap-2 text-sm text-fg-subtle lg:mx-0 lg:justify-start">
            <ScanLine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{copy.qrHint}</span>
          </p>
        </div>
        <HeroStory copy={story} points={points} xp={xp} pointsLabel={pointsLabel} xpLabel={xpLabel} />
      </div>
    </section>
  );
}
