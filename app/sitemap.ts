import type { MetadataRoute } from 'next';
import { getSeoSettings } from '@/lib/seo-settings';

/** URL sayısı bu eşiği aşarsa ileride sitemap-index (app/sitemap.xml/route.ts) ile bölünebilir. */
const SITEMAP_INDEX_THRESHOLD = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await getSeoSettings();
  if (!seo.sitemapEnabled) return [];
  const base = seo.canonicalBase || seo.siteUrl;
  const defaultEntries: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${base}/auth/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${base}/auth/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${base}/guven`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${base}/kullanim-sartlari`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${base}/gizlilik-politikasi`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${base}/kvkk-aydinlatma-metni`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${base}/cerez-politikasi`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${base}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${base}/neden-qratex`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];

  const extra = seo.extraSitemapUrls ?? [];
  const extraEntries: MetadataRoute.Sitemap = extra
    .filter((e) => e?.url && typeof e.url === 'string')
    .map((e) => ({
      url: e.url.startsWith('http') ? e.url : `${base}${e.url.startsWith('/') ? '' : '/'}${e.url}`,
      lastModified: e.lastModified ? new Date(e.lastModified) : new Date(),
      changeFrequency: (e.changeFrequency as MetadataRoute.Sitemap[0]['changeFrequency']) ?? 'monthly',
      priority: typeof e.priority === 'number' ? e.priority : 0.5,
    }));

  return [...defaultEntries, ...extraEntries];
}
