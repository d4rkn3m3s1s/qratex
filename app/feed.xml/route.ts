import { NextResponse } from 'next/server';
import { getAllPosts, getCategory, getLatestModified } from '@/lib/blog-posts';
import { getReadingSeoContext } from '@/lib/legal/seo';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * RSS 2.0 — blog yazıları (yeniden eskiye). Host, sitemap ve canonical ile AYNI kaynaktan
 * (SEO `canonicalBase` → `siteUrl`; blog denetimi bulgu 12). `lastBuildDate` istek anı değil,
 * en son değişen yazının tarihi. SEO ayarı okunamazsa varsayılan tabana düşer (fail-safe).
 */
export async function GET() {
  const { base, seo } = await getReadingSeoContext();
  const siteName = seo.siteName || 'QRateX';
  const posts = getAllPosts();
  const latest = getLatestModified(posts);
  const items = posts
    .map((p) => {
      const link = `${base}/blog/${p.slug}`;
      const category = getCategory(p.category)?.label;
      return `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${link}</link>
      <description>${escapeXml(p.description)}</description>
      <pubDate>${new Date(p.datePublished).toUTCString()}</pubDate>
      <guid isPermaLink="true">${link}</guid>${category ? `\n      <category>${escapeXml(category)}</category>` : ''}
      <dc:creator>${escapeXml(p.author.name)}</dc:creator>
    </item>`;
    })
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(siteName)} Blog</title>
    <link>${base}/blog</link>
    <description>${escapeXml(`${siteName} blog: QR ile geri bildirim, oyunlaştırma, müşteri deneyimi ve gizlilik rehberleri`)}</description>
    <language>tr</language>${latest ? `\n    <lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>` : ''}
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>${items}
  </channel>
</rss>`;
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
