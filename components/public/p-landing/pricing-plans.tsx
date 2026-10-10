import { ArrowRight, Check, Mail, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  formatPlanPrice,
  intervalSuffix,
  planQuotaLines,
  registerHrefForPlan,
  type PublicPlan,
} from '@/lib/landing/public-pricing-core';
import { cn } from '@/lib/utils';
import { CtaLink } from './cta-link';
import { fmt, PUBLIC_CONTACT_EMAIL, type PublicLocale } from './fmt';
import type { WhyCopy } from './why-copy';

/**
 * Plan kartları — tek kaynak `PricingPlan` (landing.md Bulgu 5; envanter #35/#36/#37).
 * Her CTA işletme rolünü ve plan kimliğini kayda taşır. Liste boşsa ya da okunamadıysa
 * uydurma fiyat yerine dürüst durum + gerçek iletişim kanalı.
 */
export function PricingPlans({
  plans,
  copy,
  locale,
  page,
}: {
  plans: PublicPlan[] | null;
  copy: WhyCopy['pricing'];
  locale: PublicLocale;
  page: string;
}) {
  if (!plans || plans.length === 0) {
    const unavailable = plans === null;
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center rounded-card border border-subtle bg-surface-1/90 p-8 text-center backdrop-blur-md">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-fg-muted" aria-hidden>
          <PackageOpen className="h-6 w-6" />
        </span>
        <p className="mt-4 text-lg font-semibold text-fg">{unavailable ? copy.unavailableTitle : copy.emptyTitle}</p>
        <p className="mt-2 text-sm text-fg-muted">
          {fmt(unavailable ? copy.unavailableBody : copy.emptyBody, { email: PUBLIC_CONTACT_EMAIL })}
        </p>
        <Button asChild variant="outline" className="mt-5">
          <a href={`mailto:${PUBLIC_CONTACT_EMAIL}`}>
            <Mail className="h-4 w-4" aria-hidden />
            {copy.contactCta}
          </a>
        </Button>
      </div>
    );
  }

  const cols = plans.length >= 3 ? 'lg:grid-cols-3' : plans.length === 2 ? 'md:grid-cols-2' : '';

  return (
    <>
      <ul className={cn('mx-auto grid max-w-5xl gap-5', cols)}>
        {plans.map((plan) => {
          const free = plan.price <= 0;
          const price = free ? copy.free : formatPlanPrice(plan.price, plan.currency, locale);
          const suffix = free ? '' : intervalSuffix(plan.interval, locale);
          const headingId = `plan-${plan.id}`;
          return (
            <li
              key={plan.id}
              aria-labelledby={headingId}
              className={cn(
                'relative flex flex-col rounded-card border bg-surface-1/90 p-6 backdrop-blur-md',
                plan.isPopular ? 'border-brand-border shadow-glow' : 'border-subtle shadow-sm'
              )}
            >
              {plan.isPopular ? (
                <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-fg">
                  {copy.popular}
                </span>
              ) : null}
              <h3 id={headingId} className="text-lg font-semibold text-fg">
                {plan.name}
              </h3>
              {plan.description ? <p className="mt-1 text-sm text-fg-muted">{plan.description}</p> : null}
              <p className="mt-5 flex items-baseline gap-1">
                <span className="qx-num text-4xl font-bold tracking-tight text-fg">{price}</span>
                {suffix ? <span className="text-sm text-fg-muted">{suffix}</span> : null}
              </p>

              <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{copy.quotaHeading}</p>
              <ul className="mt-2 space-y-2">
                {planQuotaLines(plan, locale).map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-sm text-fg">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>

              {plan.features.length > 0 ? (
                <>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{copy.featuresHeading}</p>
                  <ul className="mt-2 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-fg">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              <div className="mt-auto pt-6">
                <Button asChild size="lg" variant={plan.isPopular ? 'gradient' : 'outline'} className="w-full">
                  <CtaLink href={registerHrefForPlan(plan.id)} cta={free ? 'pricing_free' : 'pricing_plan'} page={page}>
                    {free ? copy.ctaFree : copy.cta}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </CtaLink>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-fg-subtle">{copy.note}</p>
    </>
  );
}
