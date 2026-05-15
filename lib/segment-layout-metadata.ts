import type { Metadata } from 'next';
import { getSeoSettings } from '@/lib/seo-settings';
import { getServerLocale } from '@/lib/server-locale';
import { t, type Locale } from '@/i18n/request';

/**
 * Panel alt rotaları için başlık + açıklama (`layoutMetadata.*` veya benzeri i18n anahtarları).
 */
export async function segmentLayoutMetadata(titleKey: string, descriptionKey: string): Promise<Metadata> {
  const [seo, locale] = await Promise.all([getSeoSettings(), getServerLocale()]);
  return {
    title: t(locale as Locale, titleKey),
    description: t(locale as Locale, descriptionKey),
    applicationName: seo.siteName,
  };
}

/**
 * İndekslenmemesi gereken iç araçlar; başlık/açıklama i18n, kısa Open Graph özeti.
 */
export async function segmentLayoutMetadataNoindex(titleKey: string, descriptionKey: string): Promise<Metadata> {
  const [seo, locale] = await Promise.all([getSeoSettings(), getServerLocale()]);
  const loc = locale as Locale;
  const title = t(loc, titleKey);
  const description = t(loc, descriptionKey);
  const ogLocale = seo.locale.replace('_', '-');
  return {
    title,
    description,
    applicationName: seo.siteName,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${title} · ${seo.siteName}`,
      description,
      siteName: seo.siteName,
      locale: ogLocale,
      type: 'website',
    },
  };
}
