/**
 * recharts için token renkleri. recharts SVG özniteliklerine CSS değişkeni
 * geçer (`stroke="hsl(var(--border))"`), böylece açık/koyu tema, preset ve
 * renk körü modları grafiğe de uygulanır. Ham hex/Tailwind paleti YOK.
 */
import type { Tone } from '@/components/states';

const role = (name: string, alpha?: number) => (alpha == null ? `hsl(var(--${name}))` : `hsl(var(--${name}) / ${alpha})`);

/** Seri renkleri: kategori token'ları 1..8 (dönerek). */
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
  tick: { fill: role('text-3'), fontSize: 12 },
  /** recharts `<Tooltip contentStyle>` için hazır stil. */
  tooltipStyle: {
    background: role('surface-2'),
    border: `1px solid ${role('border-subtle')}`,
    borderRadius: 'var(--radius-md)',
    color: role('text-1'),
    boxShadow: 'var(--elevation-2)',
    fontSize: 13,
  },
} as const;
