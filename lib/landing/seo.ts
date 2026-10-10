/**
 * Herkese açık pazarlama sayfaları için tam metadata + güvenli JSON-LD.
 *
 * Denetim (neden-qratex.md Bulgu 1-2, 7; landing.md Bulgu 14):
 *  - Next.js metadata birleştirmesi SIĞdır: alt sayfa `openGraph` verirse kökteki görsel,
 *    url, siteName düşer; `alternates` vermezse kökteki `canonical: '/'` miras kalır.
 *    Bu yardımcı canonical + tam OG + Twitter'ı her sayfa için birlikte üretir.
 *  - Başlıkta marka tekrarını önlemek için `title.absolute` kullanılabilir.
 *  - Admin SEO panelindeki yol bazlı override'lar (başlık/açıklama/canonical) uygulanır.
 *  - JSON-LD çıktısında `<` kaçışlanır (admin girdisi `</script>` ile kaçamaz).
 */
import type { Metadata } from 'next';
import { getCanonicalBase, getPageSeo, getSeoSettings, sanitizeSeoString } from '@/lib/seo-settings';

export interface PublicPageSeoInput {
  /** `/`, `/neden-qratex`, `/guven` … */
  path: string;
  title: string;
  description: string;
  /** true → kök şablon ("%s | Marka") uygulanmaz (başlık zaten markayı içeriyorsa). */
  absoluteTitle?: boolean;
  locale?: 'tr' | 'en';
}

export interface ResolvedPublicSeo {
  title: string;
  description: string;
  canonical: string;
  base: string;
  siteName: string;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  if (!path || path === '/') return b || '/';
  return `${b}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Override'larla birleşmiş başlık/açıklama/canonical. */
export async function resolvePublicSeo(input: PublicPageSeoInput): Promise<ResolvedPublicSeo> {
  const [seo, override] = await Promise.all([getSeoSettings(), getPageSeo(input.path)]);
  const base = getCanonicalBase(seo);
  return {
    title: sanitizeSeoString(override?.title) || input.title,
    description: sanitizeSeoString(override?.description) || input.description,
    canonical: override?.canonical?.trim() || joinUrl(base, input.path),
    base: base.replace(/\/+$/, ''),
    siteName: sanitizeSeoString(seo.siteName) || 'QRateX',
  };
}

export async function buildPublicMetadata(input: PublicPageSeoInput): Promise<Metadata> {
  const [seo, resolved] = await Promise.all([getSeoSettings(), resolvePublicSeo(input)]);
  const ogLocale = input.locale === 'en' ? 'en_US' : (seo.locale || 'tr_TR');
  const images = [
    {
      url: seo.ogImageUrl,
      width: seo.ogImageWidth,
      height: seo.ogImageHeight,
      alt: resolved.siteName,
    },
  ];
  return {
    title: input.absoluteTitle ? { absolute: resolved.title } : resolved.title,
    description: resolved.description,
    alternates: {
      canonical: resolved.canonical,
      languages: { tr: resolved.canonical, 'x-default': resolved.canonical },
    },
    openGraph: {
      type: 'website',
      url: resolved.canonical,
      siteName: resolved.siteName,
      locale: ogLocale.replace('_', '-'),
      title: resolved.title,
      description: resolved.description,
      images,
    },
    twitter: {
      card: seo.twitterCard,
      title: resolved.title,
      description: resolved.description,
      images: [seo.ogImageUrl],
      ...(seo.twitterHandle ? { creator: seo.twitterHandle } : {}),
    },
  };
}

// Satır/paragraf ayırıcılar kod noktasından üretilir (çıplak hâlleri kaynağı satır sonu sanılır).
const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g');
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g');

/** `<script type="application/ld+json">` içeriği: `<`, `>`, `&` ve satır ayırıcılar kaçışlanır. */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029');
}

export function breadcrumbJsonLd(base: string, items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: sanitizeSeoString(item.name),
      item: joinUrl(base, item.path),
    })),
  };
}

export function faqJsonLd(items: ReadonlyArray<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: sanitizeSeoString(item.q),
      acceptedAnswer: { '@type': 'Answer', text: sanitizeSeoString(item.a) },
    })),
  };
}
