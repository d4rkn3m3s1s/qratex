import { ImageResponse } from 'next/og';
import { OG_IMAGE_BACKGROUND_GRADIENT, OG_IMAGE_TITLE_HEX } from '@/lib/brand-colors';
import { CHART_HEX } from '@/lib/chart-palette';
import { getCategory, getPostBySlug, getReadingMinutes } from '@/lib/blog-posts';

/**
 * Yazıya özel paylaşım kartı (WhatsApp/LinkedIn/X önizlemesi) — başlık, kategori, okuma süresi.
 * İçerik depodan gelir; DB'ye dokunmaz (build-time fail-safe).
 */
export const alt = 'QRateX blog yazısı';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const title = post?.title ?? 'QRateX Blog';
  const category = post ? getCategory(post.category)?.label ?? '' : '';
  const minutes = post ? getReadingMinutes(post) : null;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: OG_IMAGE_BACKGROUND_GRADIENT,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 26, color: CHART_HEX.slateLight }}>
          <span style={{ fontWeight: 800, color: OG_IMAGE_TITLE_HEX }}>QRateX Blog</span>
          {category ? <span>· {category}</span> : null}
        </div>
        <div style={{ display: 'flex', fontSize: title.length > 60 ? 54 : 64, fontWeight: 800, lineHeight: 1.15, color: OG_IMAGE_TITLE_HEX, maxWidth: 1000 }}>
          {title}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: CHART_HEX.slate }}>
          <span>{minutes ? `${minutes} dk okuma` : ''}</span>
          <span>qratex.com/blog</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
