import type { MetadataRoute } from 'next';
import { getSeoSettings } from '@/lib/seo-settings';
import { DEFAULT_DISALLOW } from '@/lib/admin-seo/contract';

/** robots.txt'te ayrıca adlandırılan AI/arama tarayıcıları. */
const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
  'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'Bingbot',
] as const;

/**
 * Robots.txt: Admin SEO ayarlarından disallow listesi ve sitemap kullanılır.
 * Demo: NEXT_PUBLIC_DEMO_SITE=true ise tüm site disallow.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const isDemo = process.env.NEXT_PUBLIC_DEMO_SITE === 'true';
  const seo = await getSeoSettings();
  const base = (seo.canonicalBase || seo.siteUrl || '').trim().replace(/\/+$/, '');

  if (isDemo) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      sitemap: seo.sitemapEnabled ? `${base}/sitemap.xml` : undefined,
    };
  }

  const disallow = seo.robotsDisallow?.length ? seo.robotsDisallow : [...DEFAULT_DISALLOW];
  // Giriş/kayıt herkese açık giriş kapılarıdır (marka araması "qratex giriş"): /auth/ altı
  // kapalı kalırken bu ikisi açıkça izinli — en uzun eşleşme kuralı Allow'u kazandırır.
  return {
    rules: [
      { userAgent: '*', allow: ['/', '/auth/login', '/auth/register'], disallow },
      // Yapay zekâ arama/özet tarayıcıları: herkese açık sayfalar açık, paneller kapalı (llms.txt rehber).
      { userAgent: [...AI_CRAWLERS], allow: ['/', '/llms.txt'], disallow },
    ],
    sitemap: seo.sitemapEnabled ? `${base}/sitemap.xml` : undefined,
  };
}
