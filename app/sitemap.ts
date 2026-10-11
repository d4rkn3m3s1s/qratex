import type { MetadataRoute } from 'next';
import { getSeoSettings } from '@/lib/seo-settings';
import { LEGAL_DOCUMENTS, legalDateToDate } from '@/lib/legal/documents';
import { getAllPosts, getLatestModified } from '@/lib/blog-posts';
import { TRUST_CONTENT_UPDATED_AT, WHY_CONTENT_UPDATED_AT } from '@/lib/landing/content-dates';
import { listPublishedCmsForSitemap } from '@/lib/cms-pages/pages.server';

/** URL sayısı bu eşiği aşarsa ileride sitemap-index (app/sitemap.xml/route.ts) ile bölünebilir. */
const SITEMAP_INDEX_THRESHOLD = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await getSeoSettings();
  if (!seo.sitemapEnabled) return [];
  const base = seo.canonicalBase || seo.siteUrl;
  const latestBlog = getLatestModified();
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
      // İçerik revizyon tarihi (render anı değil) — lib/landing/content-dates.ts
      lastModified: new Date(`${TRUST_CONTENT_UPDATED_AT}T00:00:00Z`),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${base}/kullanim-sartlari`,
      // Yasal metnin yürürlük tarihi (render anı değil) — lib/legal/documents.ts
      lastModified: legalDateToDate(LEGAL_DOCUMENTS['kullanim-sartlari'].effectiveDate),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${base}/gizlilik-politikasi`,
      // Yasal metnin yürürlük tarihi (render anı değil) — lib/legal/documents.ts
      lastModified: legalDateToDate(LEGAL_DOCUMENTS['gizlilik-politikasi'].effectiveDate),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${base}/kvkk-aydinlatma-metni`,
      // Yasal metnin yürürlük tarihi (render anı değil) — lib/legal/documents.ts
      lastModified: legalDateToDate(LEGAL_DOCUMENTS['kvkk-aydinlatma-metni'].effectiveDate),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${base}/cerez-politikasi`,
      // Yasal metnin yürürlük tarihi (render anı değil) — lib/legal/documents.ts
      lastModified: legalDateToDate(LEGAL_DOCUMENTS['cerez-politikasi'].effectiveDate),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${base}/blog`,
      // En son değişen yazının tarihi (her istekte "bugün" değil)
      lastModified: latestBlog ? new Date(latestBlog) : undefined,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${base}/neden-qratex`,
      lastModified: new Date(`${WHY_CONTENT_UPDATED_AT}T00:00:00Z`),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];

  // Tekil blog yazıları (blog denetimi bulgu 3): değişiklik tarihi yazının kendisinden.
  const blogEntries: MetadataRoute.Sitemap = getAllPosts().map((p) => ({
    url: `${base}/blog/${p.slug}`,
    lastModified: new Date(p.dateModified),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const extra = seo.extraSitemapUrls ?? [];
  const extraEntries: MetadataRoute.Sitemap = extra
    .filter((e) => e?.url && typeof e.url === 'string')
    .map((e) => ({
      url: e.url.startsWith('http') ? e.url : `${base}${e.url.startsWith('/') ? '' : '/'}${e.url}`,
      lastModified: e.lastModified ? new Date(e.lastModified) : new Date(),
      changeFrequency: (e.changeFrequency as MetadataRoute.Sitemap[0]['changeFrequency']) ?? 'monthly',
      priority: typeof e.priority === 'number' ? e.priority : 0.5,
    }));

  // Yayındaki CMS içerik sayfaları (/admin/pages → /sayfa/<slug>); noindex olanlar hariç. DB yoksa boş.
  const cmsEntries: MetadataRoute.Sitemap = (await listPublishedCmsForSitemap()).map((p) => ({
    url: `${base}/sayfa/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  return [...defaultEntries, ...blogEntries, ...cmsEntries, ...extraEntries];
}
