/**
 * QDL token kataloğu — token'ların ADLARI, rolleri ve kontrast sözleşmesi.
 * DEĞERLER app/globals.css'te (tek kaynak). Bu dosya:
 *  - `/admin/design-language` yaşayan rehberinin tablolarını,
 *  - `__tests__/design/tokens-contrast.test.ts` kontrast testini besler.
 */

export type ColorTokenGroup = 'surface' | 'text' | 'border' | 'brand' | 'status' | 'category';

export type ColorToken = {
  /** CSS değişken adı, `--` olmadan. */
  name: string;
  group: ColorTokenGroup;
  /** Kısa Türkçe açıklama. */
  label: string;
  /** Tailwind sınıf örneği. */
  utility: string;
};

export const SURFACE_TOKENS: ColorToken[] = [
  { name: 'surface-0', group: 'surface', label: 'Sayfa zemini', utility: 'bg-surface-0' },
  { name: 'surface-1', group: 'surface', label: 'Kart / varsayılan yüzey', utility: 'bg-surface-1' },
  { name: 'surface-2', group: 'surface', label: 'Yükseltilmiş (popover, menü)', utility: 'bg-surface-elevated' },
  { name: 'surface-3', group: 'surface', label: 'Sönük / gömülü (tablo başlığı, kuyu)', utility: 'bg-surface-muted' },
];

export const TEXT_TOKENS: ColorToken[] = [
  { name: 'text-1', group: 'text', label: 'Birincil metin', utility: 'text-fg' },
  { name: 'text-2', group: 'text', label: 'İkincil metin', utility: 'text-fg-muted' },
  { name: 'text-3', group: 'text', label: 'Üçüncül / ipucu', utility: 'text-fg-subtle' },
];

export const BORDER_TOKENS: ColorToken[] = [
  { name: 'border-subtle', group: 'border', label: 'Ayırıcı kenarlık (dekoratif)', utility: 'border-subtle' },
  { name: 'border-strong', group: 'border', label: 'Kontrol sınırı (≥ 3:1)', utility: 'border-strong' },
];

export const STATUS_NAMES = ['brand', 'success', 'warning', 'danger', 'info'] as const;
export type StatusName = (typeof STATUS_NAMES)[number];

export const STATUS_LABELS: Record<StatusName, string> = {
  brand: 'Marka',
  success: 'Başarı',
  warning: 'Uyarı',
  danger: 'Hata / tehlike',
  info: 'Bilgi',
};

export const CATEGORY_TOKENS: ColorToken[] = Array.from({ length: 8 }, (_, i) => ({
  name: `category-${i + 1}`,
  group: 'category' as const,
  label: `Kimlik rengi ${i + 1}`,
  utility: `bg-category-${i + 1}`,
}));

export type ContrastPair = {
  fg: string;
  bg: string;
  /** Gereken en düşük oran. */
  min: number;
  why: string;
};

const SURFACES = ['surface-0', 'surface-1', 'surface-2', 'surface-3'];

/**
 * Kontrast sözleşmesi: her tema kombinasyonunda (açık/koyu × normal/renk körü/
 * yüksek kontrast) sağlanmak ZORUNDA olan çiftler.
 */
export function contrastContract(): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (const t of ['text-1', 'text-2', 'text-3']) {
    for (const s of SURFACES) pairs.push({ fg: t, bg: s, min: 4.5, why: `${t} metni ${s} üzerinde` });
  }
  for (const n of ['success', 'warning', 'danger', 'info', 'brand']) {
    for (const s of SURFACES) pairs.push({ fg: `${n}-text`, bg: s, min: 4.5, why: `${n} metni ${s} üzerinde` });
    pairs.push({ fg: `${n}-text`, bg: `${n}-subtle`, min: 4.5, why: `${n} rozeti (metin açık zeminde)` });
    pairs.push({ fg: `${n}-fg`, bg: n, min: 4.5, why: `${n} dolgu üzerindeki metin` });
  }
  for (const s of ['surface-0', 'surface-1']) {
    pairs.push({ fg: 'border-strong', bg: s, min: 3, why: `kontrol sınırı ${s} üzerinde (1.4.11)` });
  }
  pairs.push({ fg: 'border-strong', bg: 'background', min: 3, why: 'switch kapalı izi / başparmak' });
  return pairs;
}

/** Tipografi ölçeği (globals.css `.qx-*`). */
export const TYPE_SCALE = [
  { cls: 'qx-display', label: 'Display', spec: '36/40 · 700 · play sayıları', sample: '12.480' },
  { cls: 'qx-h1', label: 'Başlık 1', spec: '24/32 mobil · 28/34 masaüstü · 700', sample: 'Kampanya performansı' },
  { cls: 'qx-h2', label: 'Başlık 2', spec: '20/28 · 600', sample: 'Son 30 gün' },
  { cls: 'qx-h3', label: 'Başlık 3', spec: '16/24 · 600', sample: 'Bölüm başlığı' },
  { cls: 'qx-body', label: 'Gövde', spec: '14/20 (müşteride 16)', sample: 'Müşterileriniz geçen haftaya göre daha sık geri döndü.' },
  { cls: 'qx-small', label: 'Küçük', spec: '13/18', sample: 'Güncelleme: 2 dakika önce' },
  { cls: 'qx-caption', label: 'Alt yazı (alt sınır)', spec: '12/16 — bilgi taşıyan metin bunun altına inmez', sample: 'Kaynak: geri bildirimler' },
  { cls: 'qx-overline', label: 'Üst etiket', spec: '12/16 · 600 · büyük harf · 0,08em', sample: 'Yönetim paneli' },
] as const;

export const RADIUS_SCALE = [
  { token: '--radius-sm', utility: 'rounded-chip', px: 8, use: 'çip, rozet, küçük kontrol' },
  { token: '--radius-md', utility: 'rounded-control', px: 12, use: 'buton, input, select' },
  { token: '--radius-lg', utility: 'rounded-card', px: 16, use: 'kart' },
  { token: '--radius-xl', utility: 'rounded-sheet', px: 24, use: 'hero, sheet, dialog' },
] as const;

export const ELEVATION_SCALE = [
  { cls: 'qx-elevation-0', label: '0 — düz', use: 'tablo satırı, gömülü alan' },
  { cls: 'qx-elevation-1', label: '1 — kart', use: 'ops kartları (üst sınır)' },
  { cls: 'qx-elevation-2', label: '2 — açılır', use: 'menü, popover, play kartı' },
  { cls: 'qx-elevation-3', label: '3 — diyalog', use: 'dialog, sheet' },
] as const;

export const Z_SCALE = [
  { token: '--z-base', utility: 'z-base', value: 0 },
  { token: '--z-raised', utility: 'z-raised', value: 10 },
  { token: '--z-sticky', utility: 'z-sticky', value: 20 },
  { token: '--z-header', utility: 'z-header', value: 30 },
  { token: '--z-overlay', utility: 'z-overlay', value: 40 },
  { token: '--z-modal', utility: 'z-modal', value: 50 },
  { token: '--z-popover', utility: 'z-popover', value: 60 },
  { token: '--z-toast', utility: 'z-toast', value: 70 },
  { token: '--z-skip', utility: 'z-skip', value: 100 },
] as const;

export const SPACING_SCALE = [
  { token: '--space-card', utility: 'p-card', value: '16 / 20 / 24 px (mobil / sm / lg)', use: 'kart iç boşluğu' },
  { token: '--space-section', utility: 'gap-section · space-y-section', value: '24 / 32 px (mobil / lg)', use: 'sayfa bölümleri arası' },
] as const;
