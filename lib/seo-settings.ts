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
  defaultTitle: 'QRATEX - QR Tabanlı Geri Bildirim Platformu',
  defaultDescription:
    'QRATEX ile müşteri geri bildirimlerini QR kodlar üzerinden toplayın, AI ile analiz edin ve gamification ile müşteri bağlılığını artırın. Ücretsiz deneyin.',
  siteName: 'QRATEX',
  siteUrl: siteUrl,
  ogImageUrl: `${siteUrl}/logo/logo.png`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterHandle: '@qratex',
  twitterCard: 'summary_large_image',
  locale: 'tr_TR',
  keywords: ['QR kod', 'geri bildirim', 'müşteri deneyimi', 'gamification', 'AI analizi', 'işletme yönetimi'],
  organizationName: 'QRATEX',
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

async function getSeoSettingsUncached(): Promise<SeoGlobalSettings> {
  try {
    const row = await prisma.settings.findUnique({
      where: { key: SEO_SETTINGS_KEY },
      select: { value: true },
    });
    const raw = row?.value as SeoSettingsPayload | Partial<SeoGlobalSettings> | null;
    if (!raw || typeof raw !== 'object') return defaults;
    const global = 'global' in raw && raw.global ? raw.global : (raw as Partial<SeoGlobalSettings>);
    return {
      ...defaults,
      ...global,
      siteUrl: global.siteUrl ?? defaults.siteUrl,
      keywords: Array.isArray(global.keywords) ? global.keywords : defaults.keywords,
      robotsDisallow: Array.isArray(global.robotsDisallow) ? global.robotsDisallow : defaults.robotsDisallow,
      extraSitemapUrls: Array.isArray(global.extraSitemapUrls) ? global.extraSitemapUrls : [],
    };
  } catch {
    return defaults;
  }
}

/** Get merged SEO settings from DB + defaults (cached 60s, tag: seo) */
export async function getSeoSettings(): Promise<SeoGlobalSettings> {
  return unstable_cache(getSeoSettingsUncached, ['seo-settings'], { revalidate: 60, tags: [SEO_CACHE_TAG] })();
}

/** Get full SEO payload (global + page overrides) for admin */
export async function getSeoSettingsFull(): Promise<SeoSettingsPayload> {
  const global = await getSeoSettings();
  try {
    const row = await prisma.settings.findUnique({
      where: { key: SEO_SETTINGS_KEY },
      select: { value: true },
    });
    const raw = row?.value as SeoSettingsPayload | null;
    const pageOverrides = raw && 'pageOverrides' in raw && Array.isArray(raw.pageOverrides) ? raw.pageOverrides : [];
    return { global, pageOverrides };
  } catch {
    return { global, pageOverrides: [] };
  }
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
