import type { Metadata } from 'next';
import { ArrowRight, BarChart3, Brain, Inbox, LifeBuoy, Megaphone, Users, type LucideIcon } from 'lucide-react';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';
import { Button } from '@/components/ui/button';
import { getSeoSettings, sanitizeSeoString } from '@/lib/seo-settings';
import { getServerLocale } from '@/lib/server-locale';
import { getModuleControls } from '@/lib/module-gate';
import { getPublicStats } from '@/lib/landing/public-stats';
import { getPublicPricingPlans } from '@/lib/landing/public-pricing';
import { buildPricingJsonLd } from '@/lib/landing/public-pricing-core';
import {
  breadcrumbJsonLd,
  buildPublicMetadata,
  faqJsonLd,
  jsonLdHtml,
  resolvePublicSeo,
} from '@/lib/landing/seo';
import { ComparisonTable } from '@/components/public/p-landing/comparison-table';
import { CtaLink } from '@/components/public/p-landing/cta-link';
import { FaqList } from '@/components/public/p-landing/faq-list';
import { FinalCta } from '@/components/public/p-landing/final-cta';
import { fmt, PUBLIC_CONTACT_EMAIL } from '@/components/public/p-landing/fmt';
import { getLandingCopy } from '@/components/public/p-landing/landing-copy';
import { LocaleSync } from '@/components/public/p-landing/locale-sync';
import { PricingPlans } from '@/components/public/p-landing/pricing-plans';
import { PublicSection, SectionHeading } from '@/components/public/p-landing/section';
import { StatsStrip } from '@/components/public/p-landing/stats-strip';
import { getWhyCopy } from '@/components/public/p-landing/why-copy';

const PATH = '/neden-qratex';
const FEATURE_ICONS: LucideIcon[] = [Inbox, Brain, LifeBuoy, Megaphone, BarChart3, Users];

/**
 * `/neden-qratex` — işletmeler için karar sayfası (URL korunur; roadmap §6.1'deki
 * "işletmeler bölümü" burada yaşar). Denetim: canonical/OG/Twitter tam (Bulgu 1-2),
 * admin SEO override + Breadcrumb/FAQ/teklif JSON-LD (Bulgu 7), karşılaştırma tablosu
 * (Bulgu 3), işletme rolüyle kayıt (Bulgu 4), fiyatlar sayfanın içinde (Bulgu 5), TR/EN (Bulgu 6).
 */
export async function generateMetadata(): Promise<Metadata> {
  const [locale, seo] = await Promise.all([getServerLocale(), getSeoSettings()]);
  const copy = getWhyCopy(locale);
  const brand = sanitizeSeoString(seo.siteName) || 'QRateX';
  return buildPublicMetadata({
    path: PATH,
    title: fmt(copy.meta.title, { brand }),
    description: fmt(copy.meta.description, { brand }),
    absoluteTitle: true,
    locale,
  });
}

export default async function WhyQratexPage() {
  const [locale, seo, moduleControls, stats, plans] = await Promise.all([
    getServerLocale(),
    getSeoSettings(),
    getModuleControls(),
    getPublicStats(),
    getPublicPricingPlans(),
  ]);
  const copy = getWhyCopy(locale);
  const brand = sanitizeSeoString(seo.siteName) || 'QRateX';
  const resolved = await resolvePublicSeo({
    path: PATH,
    title: fmt(copy.meta.title, { brand }),
    description: fmt(copy.meta.description, { brand }),
  });
  const pricingEnabled = moduleControls.landing_pricing !== false;
  const visiblePlans = pricingEnabled ? plans : [];
  const crumbs = [
    { name: copy.breadcrumb.home, path: '/' },
    { name: fmt(copy.breadcrumb.current, { brand }), path: PATH },
  ];
  const pricingLd = visiblePlans ? buildPricingJsonLd(visiblePlans, { base: resolved.base, pagePath: `${PATH}#fiyatlar` }) : null;
  const webPageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: resolved.title,
    description: resolved.description,
    url: resolved.canonical,
    inLanguage: locale === 'en' ? 'en-US' : 'tr-TR',
  };

  return (
    <div className="relative">
      <div className="qx-read-progress" aria-hidden />
      <LocaleSync serverLocale={locale} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(webPageLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbJsonLd(resolved.base, crumbs)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqJsonLd(copy.faq.items)) }} />
      {pricingLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(pricingLd) }} /> : null}

      {/* Hero */}
      <section aria-labelledby="why-title" className="px-4 pb-12 pt-28 sm:px-6 sm:pt-32">
        <div className="mx-auto w-full max-w-6xl">
          <BreadcrumbNav items={crumbs} />
          <div className="max-w-3xl">
            <p className="qx-overline text-brand">{copy.hero.eyebrow}</p>
            <h1 id="why-title" className="qx-title-in mt-3 text-balance text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
              {fmt(copy.hero.title, { brand })}
            </h1>
            <p className="mt-5 text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">{fmt(copy.hero.sub, { brand })}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="gradient" className="px-7">
                <CtaLink href="/auth/register?role=DEALER&src=neden_qratex_hero" cta="why_register" page="neden_qratex">
                  {copy.hero.ctaRegister}
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </CtaLink>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-7">
                <CtaLink href="#fiyatlar" cta="why_pricing" page="neden_qratex">
                  {copy.hero.ctaPricing}
                </CtaLink>
              </Button>
            </div>
            <p className="mt-4 text-sm text-fg-muted">
              {copy.hero.ctaContact}:{' '}
              <a
                href={`mailto:${PUBLIC_CONTACT_EMAIL}`}
                className="inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-4 hover:no-underline"
              >
                {PUBLIC_CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </section>

      <StatsStrip
        stats={stats}
        keys={['businesses', 'feedbacks', 'feedbacksLast30d', 'rating']}
        copy={getLandingCopy(locale).stats}
        locale={locale}
        brand={brand}
      />

      <PublicSection id="karsilastirma" labelledBy="compare-title">
        <SectionHeading id="compare-title" eyebrow={copy.comparison.eyebrow} title={copy.comparison.title} sub={copy.comparison.sub} />
        <ComparisonTable copy={copy.comparison} brand={brand} />
      </PublicSection>

      <PublicSection id="nasil-baslanir" labelledBy="how-title" className="pt-0 sm:pt-0">
        <SectionHeading id="how-title" eyebrow={copy.how.eyebrow} title={copy.how.title} />
        <ol className="grid gap-x-8 gap-y-8 md:grid-cols-3">
          {copy.how.steps.map((step, i) => (
            <li key={step.title} className="list-none border-t-2 border-fg pt-4">
              <span className="qx-num font-mono text-sm font-semibold text-fg-muted" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-2 text-lg font-semibold text-fg">{step.title}</h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-fg-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </PublicSection>

      <PublicSection id="ozellikler" labelledBy="features-title" className="pt-0 sm:pt-0">
        <SectionHeading id="features-title" eyebrow={copy.features.eyebrow} title={copy.features.title} sub={copy.features.sub} />
        {/* Eşit ağırlıklı ikon-kart ızgarası yerine bölünmüş liste: başlık solda, açıklama sağda okunur. */}
        <ul className="divide-y divide-border border-y border-border">
          {copy.features.items.map((item, i) => {
            const Icon = FEATURE_ICONS[i] ?? Inbox;
            return (
              <li key={item.title} className="grid gap-2 py-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-8">
                <h3 className="flex items-center gap-2.5 text-base font-semibold text-fg">
                  <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                  {item.title}
                </h3>
                <p className="text-pretty text-sm leading-relaxed text-fg-muted">{item.body}</p>
              </li>
            );
          })}
        </ul>
      </PublicSection>

      <PublicSection id="fiyatlar" labelledBy="pricing-title">
        <SectionHeading id="pricing-title" eyebrow={copy.pricing.eyebrow} title={copy.pricing.title} sub={copy.pricing.sub} />
        <PricingPlans plans={visiblePlans} copy={copy.pricing} locale={locale} page="neden_qratex" />
      </PublicSection>

      <FaqList id="isletme-sss" eyebrow={copy.faq.eyebrow} title={copy.faq.title} items={copy.faq.items} trustLink={copy.faq.trustLink} />

      <FinalCta
        title={copy.final.title}
        sub={copy.final.sub}
        page="neden_qratex"
        primary={{ label: copy.final.ctaRegister, href: '/auth/register?role=DEALER&src=neden_qratex_final', cta: 'why_final_register' }}
        secondary={{ label: copy.final.ctaConsumer, href: '/', cta: 'why_final_consumer' }}
      />
    </div>
  );
}
