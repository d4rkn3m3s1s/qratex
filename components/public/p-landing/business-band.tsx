import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
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
  businessShotAlt,
}: {
  copy: LandingCopy['business'];
  plans: PublicPlan[] | null;
  pricingEnabled: boolean;
  locale: PublicLocale;
  brand: string;
  businessShotAlt: string;
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
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-14">
        <div>
          <p className="qx-overline text-brand">{copy.eyebrow}</p>
          <h2 id="business-title" className="mt-3 text-balance text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            {copy.title}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">{copy.sub}</p>
          <ol className="mt-8 divide-y divide-[hsl(var(--border-subtle))] border-y border-subtle">
            {copy.points.map((p, i) => (
              <li key={p} className="flex items-baseline gap-4 py-3.5">
                <span className="qx-num w-6 shrink-0 text-sm font-semibold text-brand" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-sm text-fg sm:text-base">{p}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="overflow-hidden rounded-card border border-subtle bg-surface-1 shadow-lg">
          <Image
            src="/images/landing/isletme-bugun.webp"
            alt={businessShotAlt}
            width={996}
            height={452}
            sizes="(min-width: 1024px) 600px, 100vw"
            className="h-auto w-full"
          />
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-5 rounded-card border border-subtle bg-surface-1 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="qx-overline text-fg-muted">{copy.priceLabel}</p>
          {priceLines.map((line) => (
            <p key={line} className="mt-1 text-base font-medium text-fg sm:text-lg">
              {line}
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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
    </PublicSection>
  );
}
