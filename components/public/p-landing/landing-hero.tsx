import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CtaLink } from './cta-link';
import type { LandingCopy } from './landing-copy';

/**
 * Ana sayfa hero'su (sunucu bileşeni). LCP öğesi başlık; ilk HTML'de tam opak basılır
 * (giriş animasyonu yok, istemci JS beklemez). Sağda gerçek ürün ekranı: müşteri
 * telefonu (priority, boyutlu — LCP adayı olursa da önceden yüklenir); işletme paneli
 * ekranı işletme bölümünde. Eski kart ızgarası/mikro-hikâye adası kaldırıldı (istemci JS yok).
 */
export function LandingHero({
  copy,
  points,
  xp,
  pointsLabel,
}: {
  copy: LandingCopy['hero'];
  points: string;
  xp: string;
  pointsLabel: string;
}) {
  return (
    <section aria-labelledby="hero-title" className="relative px-4 pb-16 pt-28 sm:px-6 sm:pt-32 lg:pb-24">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-10">
        <div className="text-center lg:text-left">
          <p className="qx-overline text-brand">{copy.eyebrow}</p>
          <h1
            id="hero-title"
            className="mt-4 text-balance text-5xl font-semibold leading-[1.02] tracking-tight text-fg sm:text-6xl lg:text-7xl"
          >
            {copy.titleLead} <span className="text-brand">{copy.titleAccent}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-pretty text-base leading-relaxed text-fg-muted sm:text-lg lg:mx-0">
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
          <p className="mx-auto mt-1 flex max-w-lg items-start justify-center gap-2 text-sm text-fg-muted lg:mx-0 lg:justify-start">
            <ScanLine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{copy.qrHint}</span>
          </p>
        </div>

        <figure className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="relative mx-auto w-[260px] sm:w-[290px]">
            <div className="overflow-hidden rounded-[2rem] border-[6px] border-surface-3 bg-surface-1 shadow-xl">
              <Image
                src="/images/landing/musteri-ana.webp"
                alt={copy.shotCustomerAlt}
                width={390}
                height={640}
                priority
                sizes="290px"
                className="h-auto w-full"
              />
            </div>
            <p
              className="absolute -right-4 bottom-10 rounded-control border border-subtle bg-surface-1 px-3 py-2 text-sm font-semibold text-fg shadow-md sm:-right-10"
              aria-hidden
            >
              <span className="qx-num text-brand">+{points}</span> {pointsLabel} · <span className="qx-num">+{xp}</span> XP
            </p>
          </div>
          <figcaption className="sr-only">{copy.shotCaption}</figcaption>
        </figure>
      </div>
    </section>
  );
}
