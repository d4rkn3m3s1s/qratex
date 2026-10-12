/**
 * recharts için token renkleri. recharts SVG özniteliklerine CSS değişkeni
 * geçer (`stroke="hsl(var(--border))"`), böylece açık/koyu tema, preset ve
 * renk körü modları grafiğe de uygulanır. Ham hex/Tailwind paleti YOK.
 */
import type { Tone } from '@/components/states';

const role = (name: string, alpha?: number) => (alpha == null ? `hsl(var(--${name}))` : `hsl(var(--${name}) / ${alpha})`);

/**
 * Seri renkleri: kategori token'ları 1..8. Sıra renk körü güvenliğinin
 * kendisidir (validate_palette: bitişik CVD ΔE ≥ 8, açık+koyu) — sırayı
 * değiştirmeyin; seriyi sıraya değil VARLIĞA bağlayın. 8'den fazla seri
 * "Diğer"e katlanmalı (mod döngüsü yalnız güvenlik ağıdır).
 * Saçılım/çok-panel gibi tüm çiftlerin yan yana geldiği biçimlerde ilk 3 slot.
 */
export function chartSeriesColor(index: number, alpha?: number): string {
  const i = ((Math.trunc(index) % 8) + 8) % 8;
  return role(`category-${i + 1}`, alpha);
}

const TONE_ROLE: Record<Tone, string> = {
  neutral: 'text-2',
  brand: 'brand',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
};

/** Anlam tonunun dolgu rengi (tek seri / eşik çizgisi). */
export function chartToneColor(tone: Tone, alpha?: number): string {
  return role(TONE_ROLE[tone], alpha);
}

/** Sıralı (büyüklük) palet: tek ton mavi, t ∈ [0,1] açık→koyu (koyu temada ters adım). */
export function chartSequentialColor(t: number): string {
  const p = Math.round(Math.min(1, Math.max(0, t)) * 100);
  return `color-mix(in oklab, hsl(var(--chart-seq-hi)) ${p}%, hsl(var(--chart-seq-lo)))`;
}

/** Ayrışan (kutup) palet: v ∈ [-1,1]; −1 kırmızı, 0 nötr gri, +1 mavi. */
export function chartDivergingColor(v: number): string {
  const c = Math.min(1, Math.max(-1, v));
  const p = Math.round(Math.abs(c) * 100);
  const pole = c < 0 ? 'chart-div-neg' : 'chart-div-pos';
  return `color-mix(in oklab, hsl(var(--${pole})) ${p}%, hsl(var(--chart-div-mid)))`;
}

/** Eksen, ızgara, ipucu kutusu ve imleç için ortak token'lar. */
export const CHART_THEME = {
  grid: role('border-subtle'),
  axis: role('text-3'),
  axisLabel: role('text-2'),
  tooltipBg: role('surface-2'),
  tooltipBorder: role('border-subtle'),
  tooltipText: role('text-1'),
  cursor: role('text-3', 0.12),
  reference: role('border-strong'),
  /** recharts `tick` prop'u için hazır stil. */
  tick: { fill: role('text-3'), fontSize: 11 },
  /** recharts `<Tooltip contentStyle>` için hazır stil. */
  tooltipStyle: {
    background: role('surface-2'),
    border: `1px solid ${role('border-subtle')}`,
    borderRadius: 'var(--radius-md)',
    color: role('text-1'),
    boxShadow: 'var(--elevation-2)',
    fontSize: 13,
  },
  /** İpucu metni seri renginde değil metin token'ında (renk yalnız işarette). */
  tooltipLabelStyle: { color: role('text-1'), fontWeight: 600 },
  tooltipItemStyle: { color: role('text-2') },
  /** recharts `<Legend wrapperStyle>` — sakin, ikincil mürekkep. */
  legendStyle: { fontSize: 12, color: role('text-2') },
  /** Çubuk uçları: 4px yuvarlak, taban düz. */
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
} as const;

/** `<Tooltip {...chartTooltipProps} />` — tema uyumlu kutu + metin. */
export const chartTooltipProps = {
  contentStyle: CHART_THEME.tooltipStyle,
  labelStyle: CHART_THEME.tooltipLabelStyle,
  itemStyle: CHART_THEME.tooltipItemStyle,
  cursor: { fill: CHART_THEME.cursor },
} as const;
