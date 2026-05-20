import { CHART_HEX } from './chart-palette';

/**
 * Brand solid hex values for contexts that cannot use `hsl(var(--primary))`
 * (e‑mail HTML, some canvas/particle APIs, Google Wallet, Prisma seed defaults).
 * Keep in sync with `app/globals.css` `--primary` (≈ hsl(262 83% 58%)).
 */
export const BRAND_PRIMARY_HEX = '#9333ea' as const;

/** Slightly deeper violet for gradients and headings (e.g. verify email) */
export const BRAND_PRIMARY_HEX_DEEP = '#7c3aed' as const;

/** Varsayılan tema vurgusu (tohum / seed `accentColor` ile uyumlu) */
export const BRAND_ACCENT_PINK_HEX = '#d946ef' as const;

/**
 * Aurora / mor preset ikincil — Tailwind violet-500 (`CHART_HEX.violet` = #a78bfa değildir).
 */
export const BRAND_LILAC_HEX = '#a855f7' as const;

/** Saf siyah/beyaz — QR önizleme, export, spotlight */
export const HEX_BLACK = '#000000' as const;
export const HEX_WHITE = '#ffffff' as const;

/** Baskı/PDF ve düşük kontrastlı metin yüzeyi */
export const BRAND_INK_HEX = '#1a1a1a' as const;

/** Kart & kullanıcı QR `toDataURL` koyu modülü (birçok sayfada aynı değer) */
export const BRAND_CARD_QR_DARK_HEX = '#1a1a2e' as const;

/** Bayi QR önizleme hazır renkleri (arka plan / ön plan çiftleri) */
export const QR_PRESET_DISPLAY_HEX = {
  violet50: '#f5f3ff',
  sky700: '#0369a1',
  sky50: '#f0f9ff',
  red700: '#b91c1c',
  red50: '#fef2f2',
} as const;

/** `viewport.themeColor` — tarayıcı chrome (layout); theme ile uyumlu nötr */
export const VIEWPORT_THEME_COLOR_LIGHT = '#fafafa' as const;
export const VIEWPORT_THEME_COLOR_DARK = '#0b1220' as const;

/** `app/opengraph-image.tsx` — OG görsel arka planı ve başlık (mevcut görünümle aynı) */
export const OG_IMAGE_BACKGROUND_GRADIENT =
  'linear-gradient(135deg, #0f0f0f 0%, #1a0a2e 50%, #16213e 100%)' as const;
export const OG_IMAGE_TITLE_HEX = '#e9d5ff' as const;

/** Landing AuroraText / marketing accents — first stop is always brand primary */
export const BRAND_AURORA_HEX_STOPS: readonly string[] = [
  BRAND_PRIMARY_HEX,
  CHART_HEX.pink,
  BRAND_LILAC_HEX,
  BRAND_ACCENT_PINK_HEX,
];
