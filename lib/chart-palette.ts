/**
 * Sabit veri görselleştirme renkleri (seriler birbirinden ayrılsın diye).
 * Marka birincil rengi için mümkün olduğunca `CHART_BRAND` (`hsl(var(--primary))`) kullanın.
 */
export const CHART_BRAND = 'hsl(var(--primary))' as const;

export const CHART_HEX = {
  blue: '#3b82f6',
  green: '#22c55e',
  emerald: '#10b981',
  amber: '#f59e0b',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
  slate: '#64748b',
  slate200: '#cbd5e1',
  slateLight: '#94a3b8',
  neutral: '#6b7280',
  /** Tema preset / UI — Tailwind karşılıkları */
  gray800: '#1f2937',
  emerald400: '#34d399',
  orange400: '#fb923c',
  amber300: '#fbbf24',
  pink200: '#f9a8d4',
  cyan: '#06b6d4',
  pink: '#ec4899',
  pinkLight: '#f472b6',
  teal: '#14b8a6',
  sky: '#0ea5e9',
  skyLight: '#22d3ee',
  indigo: '#818cf8',
  violet: '#a78bfa',
} as const;
