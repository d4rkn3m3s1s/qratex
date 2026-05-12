import { ImageResponse } from 'next/og';
import { OG_IMAGE_BACKGROUND_GRADIENT, OG_IMAGE_TITLE_HEX } from '@/lib/brand-colors';
import { getSeoSettings } from '@/lib/seo-settings';
import { CHART_HEX } from '@/lib/chart-palette';

export const alt = 'QRATEX - QR Tabanlı Geri Bildirim Platformu';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;
export const dynamic = 'force-dynamic';

const defaultTitle = 'QRATEX';
const defaultDesc = 'QR tabanlı geri bildirim ve gamification platformu. Müşteri deneyimini dönüştürün.';

export default async function Image() {
  let title = defaultTitle;
  let desc = defaultDesc;
  try {
    const seo = await getSeoSettings();
    title = seo.defaultTitle || defaultTitle;
    desc = (seo.defaultDescription ?? defaultDesc).slice(0, 120);
  } catch {
    // Build veya DB yokken varsayılanlarla devam et
  }
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: OG_IMAGE_BACKGROUND_GRADIENT,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 80,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: OG_IMAGE_TITLE_HEX,
              marginBottom: 24,
            }}
          >
            {title.replace(' | QRATEX', '').split(' - ')[0] || title}
          </div>
          <div style={{ fontSize: 28, color: CHART_HEX.slateLight, maxWidth: 900 }}>{desc}</div>
          <div style={{ marginTop: 40, fontSize: 22, color: CHART_HEX.slate }}>qratex.com</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
