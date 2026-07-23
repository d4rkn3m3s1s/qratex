import { NextResponse } from 'next/server';
import { siteUrl } from '@/lib/site-config';
import { BLOG_POSTS } from '@/lib/blog-posts';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** RSS feed; blog yazılarını içerir. */
export async function GET() {
  const base = siteUrl;
  const items = BLOG_POSTS.map(
    (p) => `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${base}/blog/${p.slug}</link>
      <description>${escapeXml(p.description)}</description>
      <pubDate>${new Date(p.datePublished).toUTCString()}</pubDate>
      <guid isPermaLink="true">${base}/blog/${p.slug}</guid>
    </item>`
  ).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>QRateX Blog</title>
    <link>${base}/blog</link>
    <description>QR Tabanlı Geri Bildirim Platformu - Blog</description>
    <language>tr</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
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
