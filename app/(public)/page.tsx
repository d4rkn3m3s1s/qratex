import type { Metadata } from 'next';
import { getSeoSettings, getCanonicalBase, getPageSeo, sanitizeSeoString } from '@/lib/seo-settings';
import { getBackgroundEffect } from '@/lib/get-background-effect';
import { getMessages } from '@/i18n/request';
import { getServerLocale } from '@/lib/server-locale';
import HomeClient from './home-client';

export async function generateMetadata(): Promise<Metadata> {
  const override = await getPageSeo('/');
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  return {
    title: override?.title ?? seo.defaultTitle,
    description: override?.description ?? seo.defaultDescription,
    alternates: { canonical: override?.canonical ?? base },
  };
}

export default async function HomePage() {
  const [seo, backgroundEffect, locale] = await Promise.all([
    getSeoSettings(),
    getBackgroundEffect(),
    getServerLocale(),
  ]);
  const base = getCanonicalBase(seo);
  const landing = getMessages(locale).landing;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: sanitizeSeoString(seo.organizationName),
        url: base,
        logo: { '@type': 'ImageObject', url: `${base}/logo/logo.png` },
        description: sanitizeSeoString(seo.organizationDescription),
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        name: sanitizeSeoString(seo.siteName),
        url: base,
        description: sanitizeSeoString(seo.websiteDescription),
        publisher: { '@id': `${base}/#organization` },
        inLanguage: (seo.locale || 'tr_TR').replace('_', '-'),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: landing.schema.breadcrumbHome, item: base },
        ],
      },
    ],
  };

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: landing.faq.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  const plans = landing.pricing.plans;
  const priceValidUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pricingLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: [
      {
        '@type': 'Product',
        name: plans.free.name,
        description: plans.free.description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'TRY' },
      },
      {
        '@type': 'Product',
        name: plans.starter.name,
        description: plans.starter.description,
        offers: {
          '@type': 'Offer',
          price: '299',
          priceCurrency: 'TRY',
          priceValidUntil,
        },
      },
      {
        '@type': 'Product',
        name: plans.professional.name,
        description: plans.professional.description,
        offers: {
          '@type': 'Offer',
          price: '699',
          priceCurrency: 'TRY',
          priceValidUntil,
        },
      },
    ],
  };

  const demoVideoUrl = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL;
  const videoLd = demoVideoUrl
    ? {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: sanitizeSeoString(seo.siteName) + ' Demo',
        description: sanitizeSeoString(seo.defaultDescription).slice(0, 200),
        contentUrl: demoVideoUrl,
        uploadDate: new Date().toISOString(),
      }
    : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingLd) }}
      />
      {videoLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(videoLd) }}
        />
      )}
      <HomeClient initialBackgroundEffect={backgroundEffect} />
    </>
  );
}
