/**
 * Okuma sayfaları (yasal belgeler + blog) için metadata yardımcıları — sunucu.
 *
 * Kök layout `alternates.canonical: '/'` ve ana sayfanın `openGraph`'ını tanımlar; alt sayfa
 * bunları açıkça ezmezse canonical ana sayfaya düşer ve paylaşım kartı ana sayfa gibi görünür
 * (blog denetimi bulgu 1). Next metadata `openGraph`'ı sığ birleştirdiği için burada `url`,
 * `siteName`, `locale`, `images` her seferinde eksiksiz verilir.
 *
 * FAIL-SAFE: SEO ayarları DB'den okunamazsa `getSeoSettings` varsayılana düşer; taban URL
 * `resolveSeoBaseUrl` ile asla fırlatmaz (build-time DB erişimi yokken de deploy patlamaz).
 */
import type { Metadata } from 'next';
import { getPageSeo, getSeoSettings, type SeoGlobalSettings } from '@/lib/seo-settings';
import { resolveSeoBaseUrl } from '@/lib/seo-url';
import { siteUrl } from '@/lib/site-config';
import { getLegalDocument, legalDateToDate, type LegalSlug } from './documents';

export interface ReadingSeoContext {
  seo: SeoGlobalSettings;
  base: string;
}

export async function getReadingSeoContext(): Promise<ReadingSeoContext> {
  const seo = await getSeoSettings();
  return { seo, base: resolveSeoBaseUrl(seo, siteUrl) };
}

/** Mutlak URL üretir (kök-göreli yol ya da zaten mutlak). */
export function absoluteUrl(base: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${base}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

export interface ReadingMetadataInput {
  path: string;
  title: string;
  description: string;
  type: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  /** Verilmezse site OG görseli; `false` → images alanı hiç yazılmaz (dosya tabanlı OG görseli kullanılır). */
  image?: string | false;
  authors?: string[];
  section?: string;
  tags?: string[];
  /** Admin SEO panelinden gelen canonical ezmesi. */
  canonicalOverride?: string;
}

export function buildReadingMetadata(ctx: ReadingSeoContext, input: ReadingMetadataInput): Metadata {
  const { seo, base } = ctx;
  const url = input.canonicalOverride ? absoluteUrl(base, input.canonicalOverride) : `${base}${input.path}`;
  const images =
    input.image === false
      ? undefined
      : [
          {
            url: absoluteUrl(base, input.image || seo.ogImageUrl || '/logo/logo.png'),
            width: seo.ogImageWidth || 1200,
            height: seo.ogImageHeight || 630,
            alt: input.title,
          },
        ];
  const openGraph: NonNullable<Metadata['openGraph']> =
    input.type === 'article'
      ? {
          type: 'article',
          url,
          title: input.title,
          description: input.description,
          siteName: seo.siteName,
          locale: seo.locale || 'tr_TR',
          publishedTime: input.publishedTime,
          modifiedTime: input.modifiedTime,
          authors: input.authors,
          section: input.section,
          tags: input.tags,
          ...(images ? { images } : {}),
        }
      : {
          type: 'website',
          url,
          title: input.title,
          description: input.description,
          siteName: seo.siteName,
          locale: seo.locale || 'tr_TR',
          ...(images ? { images } : {}),
        };
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph,
    twitter: {
      card: seo.twitterCard || 'summary_large_image',
      title: input.title,
      description: input.description,
      ...(seo.twitterHandle ? { site: seo.twitterHandle } : {}),
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}

/** Yasal belge sayfasının metadata'sı (admin SEO ezmesi + sürüm tarihi). */
export async function buildLegalMetadata(slug: LegalSlug): Promise<Metadata> {
  const doc = getLegalDocument(slug);
  const [ctx, override] = await Promise.all([getReadingSeoContext(), getPageSeo(doc.path)]);
  return buildReadingMetadata(ctx, {
    path: doc.path,
    title: override?.title || doc.title,
    description: override?.description || doc.description,
    type: 'article',
    modifiedTime: legalDateToDate(doc.effectiveDate).toISOString(),
    canonicalOverride: override?.canonical || undefined,
    section: 'Yasal',
  });
}
