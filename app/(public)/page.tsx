import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { roleHome } from '@/lib/auth/post-login-target';
import { getSeoSettings, sanitizeSeoString } from '@/lib/seo-settings';
import { getServerLocale } from '@/lib/server-locale';
import { getModuleControls } from '@/lib/module-gate';
import { getPublicStats } from '@/lib/landing/public-stats';
import { getPublicPricingPlans } from '@/lib/landing/public-pricing';
import { hasFreePlan } from '@/lib/landing/public-pricing-core';
import { getEarnPreview } from '@/lib/landing/earn-preview';
import { buildPublicMetadata, faqJsonLd, jsonLdHtml, resolvePublicSeo } from '@/lib/landing/seo';
import { fmt, formatInt, PUBLIC_CONTACT_EMAIL } from '@/components/public/p-landing/fmt';
import { getLandingCopy } from '@/components/public/p-landing/landing-copy';
import { LandingHero } from '@/components/public/p-landing/landing-hero';
import { StatsStrip } from '@/components/public/p-landing/stats-strip';
import { EarnLoop } from '@/components/public/p-landing/earn-loop';
import { TryIt } from '@/components/public/p-landing/try-it';
import { CollectionPreview } from '@/components/public/p-landing/collection-preview';
import { BusinessBand } from '@/components/public/p-landing/business-band';
import { FaqList } from '@/components/public/p-landing/faq-list';
import { FinalCta } from '@/components/public/p-landing/final-cta';
import { LocaleSync } from '@/components/public/p-landing/locale-sync';
import { PublicSection, SectionHeading } from '@/components/public/p-landing/section';

/**
 * Ana sayfa — sunucu önce (denetim landing.md, Dalga 2).
 *  - Oturum açık kullanıcı SUNUCUDA rol ana sayfasına yönlenir (istemci `router.push`
 *    flaşı ve geri tuşu döngüsü yok; STAFF dahil tek kaynak `roleHome`).
 *  - Kritik veri (istatistik, puan kuralları, planlar) sunucuda, önbellekli ve fail-safe.
 *  - İstemci adaları küçük: hero mikro-hikâyesi, deneme alanı, CTA ölçümü, dil eşitleyici.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [locale, seo] = await Promise.all([getServerLocale(), getSeoSettings()]);
  const copy = getLandingCopy(locale);
  const brand = sanitizeSeoString(seo.siteName) || 'QRateX';
  // TR'de admin SEO panelindeki varsayılan başlık/açıklama ana sayfanındır; EN için çeviri.
  return buildPublicMetadata({
    path: '/',
    title: locale === 'en' ? fmt(copy.meta.title, { brand }) : seo.defaultTitle,
    description: locale === 'en' ? copy.meta.description : seo.defaultDescription,
    absoluteTitle: true,
    locale,
  });
}

export default async function HomePage() {
  const session = await getServerSession(authOptions).catch(() => null);
  const home = roleHome(session?.user?.role);
  if (home !== '/') redirect(home);

  const [locale, seo, moduleControls, stats, earn, plans] = await Promise.all([
    getServerLocale(),
    getSeoSettings(),
    getModuleControls(),
    getPublicStats(),
    getEarnPreview(),
    getPublicPricingPlans(),
  ]);
  const copy = getLandingCopy(locale);
  const brand = sanitizeSeoString(seo.siteName) || 'QRateX';
  const resolved = await resolvePublicSeo({ path: '/', title: seo.defaultTitle, description: seo.defaultDescription });
  const base = resolved.base;
  // Admin modül anahtarı: fiyatlandırma kapalıysa fiyat bağlantıları ve fiyat cümlesi gizlenir.
  const pricingEnabled = moduleControls.landing_pricing !== false;

  const n = (v: number) => formatInt(v, locale);
  const faqVars = {
    base: n(earn.feedback.base.points),
    detailed: n(earn.feedback.detailed.points),
    threshold: n(earn.feedback.longTextThreshold),
    dailyCap: n(earn.feedbackDailyCap),
    email: PUBLIC_CONTACT_EMAIL,
  };
  const businessAnswer = !pricingEnabled || !plans || plans.length === 0
    ? copy.faq.contactAnswer
    : hasFreePlan(plans)
      ? copy.faq.freePlanAnswer
      : copy.faq.paidOnlyAnswer;
  const faqItems = [
    ...copy.faq.items.map((item) => ({ q: item.q, a: fmt(item.a, faqVars) })),
    { q: copy.faq.businessQuestion, a: fmt(businessAnswer, faqVars) },
  ];

  const graphLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: sanitizeSeoString(seo.organizationName),
        url: base,
        // Kare, koyu zeminli logo: Google'ın marka/AI özetlerinde beyaz zeminde de görünür.
        logo: { '@type': 'ImageObject', url: `${base}/icons/favicon-512.png`, width: 512, height: 512 },
        image: `${base}/icons/favicon-512.png`,
        // Varlık ayrımı (benzer adlarla karışmasın): resmi adlar ve resmi profiller.
        alternateName: ['QRateX', 'Qratex', 'QRateX App'],
        sameAs: ['https://www.instagram.com/qratexco/'],
        description: sanitizeSeoString(seo.organizationDescription),
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        name: brand,
        url: base,
        description: sanitizeSeoString(seo.websiteDescription),
        publisher: { '@id': `${base}/#organization` },
        inLanguage: locale === 'en' ? 'en-US' : 'tr-TR',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [{ '@type': 'ListItem', position: 1, name: copy.schema.breadcrumbHome, item: base }],
      },
    ],
  };

  return (
    <div className="relative">
      <LocaleSync serverLocale={locale} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(graphLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqJsonLd(faqItems)) }} />

      <LandingHero
        copy={copy.hero}
        points={n(earn.feedback.base.points)}
        xp={n(earn.feedback.base.xp)}
        pointsLabel={copy.tryIt.pointsUnit}
      />

      <StatsStrip
        stats={stats}
        keys={['members', 'businesses', 'feedbacks', 'rating']}
        copy={copy.stats}
        locale={locale}
        brand={brand}
        showHeading
      />

      <EarnLoop copy={copy.earn} earn={earn} locale={locale} />

      <PublicSection id="dene" labelledBy="try-title" className="pt-0 sm:pt-0">
        <SectionHeading id="try-title" eyebrow={copy.tryIt.eyebrow} title={copy.tryIt.title} sub={copy.tryIt.sub} />
        <TryIt copy={copy.tryIt} feedback={earn.feedback} locale={locale} />
      </PublicSection>

      <CollectionPreview copy={copy.collection} earn={earn} locale={locale} />

      <BusinessBand
        copy={copy.business}
        plans={plans}
        pricingEnabled={pricingEnabled}
        locale={locale}
        brand={brand}
        businessShotAlt={copy.hero.shotBusinessAlt}
      />

      <FaqList eyebrow={copy.faq.eyebrow} title={copy.faq.title} items={faqItems} trustLink={copy.faq.trustLink} />

      <FinalCta
        title={copy.final.title}
        sub={copy.final.sub}
        page="landing"
        primary={{ label: copy.final.ctaPrimary, href: '/auth/register?role=CUSTOMER&src=landing_final', cta: 'final_join' }}
        secondary={{ label: copy.final.ctaBusiness, href: '/auth/register?role=DEALER&src=landing_final', cta: 'final_business' }}
      />
    </div>
  );
}
