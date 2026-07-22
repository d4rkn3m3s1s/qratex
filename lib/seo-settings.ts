import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { siteUrl } from '@/lib/site-config';

export const SEO_SETTINGS_KEY = 'seo';
export const SEO_CACHE_TAG = 'seo';

export interface ExtraSitemapEntry {
  url: string;
  priority?: number;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  /** ISO date string; sitemap lastmod için kullanılır */
  lastModified?: string;
}

export interface SeoGlobalSettings {
  defaultTitle: string;
  defaultDescription: string;
  siteName: string;
  siteUrl: string;
  ogImageUrl: string;
  ogImageWidth: number;
  ogImageHeight: number;
  twitterHandle: string;
  twitterCard: 'summary' | 'summary_large_image';
  locale: string;
  keywords: string[];
  organizationName: string;
  organizationDescription: string;
  websiteDescription: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  robotsDisallow: string[];
  sitemapEnabled: boolean;
  canonicalBase: string;
  /** Sitemap'e eklenecek ek URL'ler (Admin'den) */
  extraSitemapUrls?: ExtraSitemapEntry[];
}

const defaults: SeoGlobalSettings = {
  defaultTitle: 'QRateX - QR Tabanlı Geri Bildirim Platformu',
  defaultDescription:
    'QRateX ile müşteri geri bildirimlerini QR kodlar üzerinden toplayın, AI ile analiz edin ve gamification ile müşteri bağlılığını artırın. Ücretsiz deneyin.',
  siteName: 'QRateX',
  siteUrl: siteUrl,
  ogImageUrl: `${siteUrl}/logo/logo.png`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterHandle: '@qratex',
  twitterCard: 'summary_large_image',
  locale: 'tr_TR',
  keywords: ['QR kod', 'geri bildirim', 'müşteri deneyimi', 'gamification', 'AI analizi', 'işletme yönetimi'],
  organizationName: 'QRateX',
  organizationDescription: 'QR tabanlı geri bildirim ve gamification platformu. Müşteri deneyimini AI ve gamification ile dönüştürün.',
  websiteDescription: 'Müşteri geri bildirimlerini QR kodlar üzerinden toplayın, AI ile analiz edin ve gamification ile müşteri bağlılığını artırın.',
  robotsIndex: true,
  robotsFollow: true,
  robotsDisallow: ['/admin/', '/dealer/', '/customer/', '/auth/'],
  sitemapEnabled: true,
  canonicalBase: '',
  extraSitemapUrls: [],
};

/** Script/HTML injection riskini azaltmak için tehlikeli karakterleri temizler */
export function sanitizeSeoString(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return '';
  return s.replace(/<[^>]*>/g, '').trim();
}

export type SeoPageOverride = {
  path: string;
  title: string;
  description: string;
  canonical?: string;
};

export interface SeoSettingsPayload {
  global: SeoGlobalSettings;
  pageOverrides?: SeoPageOverride[];
}

type SeoRowPayload = {
  global: SeoGlobalSettings;
  pageOverrides: SeoPageOverride[];
};

async function loadSeoSettingsRow(): Promise<SeoRowPayload> {
  try {
    const row = await prisma.settings.findUnique({
      where: { key: SEO_SETTINGS_KEY },
      select: { value: true },
    });
    const raw = row?.value as SeoSettingsPayload | Partial<SeoGlobalSettings> | null;
    if (!raw || typeof raw !== 'object') {
      return { global: defaults, pageOverrides: [] };
    }
    const globalSource = 'global' in raw && raw.global ? raw.global : (raw as Partial<SeoGlobalSettings>);
    const global: SeoGlobalSettings = {
      ...defaults,
      ...globalSource,
      siteUrl: globalSource.siteUrl ?? defaults.siteUrl,
      keywords: Array.isArray(globalSource.keywords) ? globalSource.keywords : defaults.keywords,
      robotsDisallow: Array.isArray(globalSource.robotsDisallow) ? globalSource.robotsDisallow : defaults.robotsDisallow,
      extraSitemapUrls: Array.isArray(globalSource.extraSitemapUrls) ? globalSource.extraSitemapUrls : [],
    };
    const pageOverrides =
      'pageOverrides' in raw && Array.isArray((raw as SeoSettingsPayload).pageOverrides)
        ? ((raw as SeoSettingsPayload).pageOverrides as SeoPageOverride[])
        : [];
    return { global, pageOverrides };
  } catch {
    return { global: defaults, pageOverrides: [] };
  }
}

async function getSeoRowPayloadFromDataCache(): Promise<SeoRowPayload> {
  return unstable_cache(loadSeoSettingsRow, ['seo-settings'], { revalidate: 60, tags: [SEO_CACHE_TAG] })();
}

/** Tek satır: unstable_cache + istek başına tek Prisma. */
const getSeoRowPayload = cache(getSeoRowPayloadFromDataCache);

async function getSeoSettingsFromRow(): Promise<SeoGlobalSettings> {
  const { global } = await getSeoRowPayload();
  return global;
}

/** Get merged SEO settings from DB + defaults (cached 60s, tag: seo). Aynı RSC isteğinde tek Prisma yolu. */
export const getSeoSettings = cache(getSeoSettingsFromRow);

/** Get full SEO payload (global + page overrides) for admin — ekstra Prisma yok. */
export async function getSeoSettingsFull(): Promise<SeoSettingsPayload> {
  const { global, pageOverrides } = await getSeoRowPayload();
  return { global, pageOverrides };
}

/** Path'e göre sayfa override döner (public sayfa metadata için) */
export async function getPageSeo(path: string): Promise<SeoPageOverride | null> {
  const { pageOverrides } = await getSeoSettingsFull();
  const normalized = path.replace(/\/$/, '') || '/';
  return pageOverrides?.find((p) => (p.path.replace(/\/$/, '') || '/') === normalized) ?? null;
}

export function getCanonicalBase(settings: SeoGlobalSettings): string {
  return settings.canonicalBase || settings.siteUrl;
}
