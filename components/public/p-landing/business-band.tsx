import { ArrowRight, Check, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  formatPlanPrice,
  hasFreePlan,
  intervalSuffix,
  lowestPaidPlan,
  type PublicPlan,
} from '@/lib/landing/public-pricing-core';
import { CtaLink } from './cta-link';
import { fmt, type PublicLocale } from './fmt';
import type { LandingCopy } from './landing-copy';
import { PublicSection } from './section';

/**
 * Ana sayfadaki işletme şeridi: değer önerisi + gerçek plan tablosundan "başlangıç fiyatı"
 * + işletme sayfasına / plan listesine / işletme kaydına yönlendirme.
 * `plans === null` (fiyat okunamadı) ya da fiyat modülü kapalıysa fiyat cümlesi nötr kalır.
 */
export function BusinessBand({
  copy,
  plans,
  pricingEnabled,
  locale,
  brand,
}: {
  copy: LandingCopy['business'];
  plans: PublicPlan[] | null;
  pricingEnabled: boolean;
  locale: PublicLocale;
  brand: string;
}) {
  const list = pricingEnabled && plans ? plans : [];
  const lowest = lowestPaidPlan(list);
  const priceLines: string[] = [];
  if (hasFreePlan(list)) priceLines.push(copy.priceFree);
  if (lowest) {
    priceLines.push(
      fmt(copy.priceFrom, {
        price: formatPlanPrice(lowest.price, lowest.currency, locale),
        interval: intervalSuffix(lowest.interval, locale),
      })
    );
  }
  if (priceLines.length === 0) priceLines.push(copy.priceUnknown);

  return (
    <PublicSection id="isletmeler" labelledBy="business-title">
      <div className="relative overflow-hidden rounded-sheet border border-subtle bg-surface-1/90 p-6 shadow-sm backdrop-blur-md sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
        />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="qx-overline flex items-center gap-2 text-brand">
              <Store className="h-4 w-4" aria-hidden />
              {copy.eyebrow}
            </p>
            <h2 id="business-title" className="mt-3 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              {copy.title}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-fg-muted sm:text-lg">{copy.sub}</p>
            <ul className="mt-6 space-y-3">
              {copy.points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-fg">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-subtle text-success" aria-hidden>
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm sm:text-base">{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-card border border-subtle bg-surface-0/80 p-5 sm:p-6">
            {priceLines.map((line) => (
              <p key={line} className="text-base font-medium text-fg">
                {line}
              </p>
            ))}
            <div className="mt-5 flex flex-col gap-3">
              <Button asChild size="lg" variant="gradient">
                <CtaLink href="/auth/register?role=DEALER&src=landing_business" cta="business_register" page="landing">
                  {copy.ctaRegister}
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </CtaLink>
              </Button>
              <Button asChild size="lg" variant="outline">
                <CtaLink href="/neden-qratex" cta="business_why" page="landing">
                  {fmt(copy.ctaWhy, { brand })}
                </CtaLink>
              </Button>
              {pricingEnabled ? (
                <Button asChild size="lg" variant="ghost">
                  <CtaLink href="/neden-qratex#fiyatlar" cta="business_pricing" page="landing">
                    {copy.ctaPricing}
                  </CtaLink>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </PublicSection>
  );
}
