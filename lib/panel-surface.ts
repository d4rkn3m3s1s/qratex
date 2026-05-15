import { cn } from '@/lib/utils';

/** Ortak “özet / metrik” kart yüzeyi — admin operasyon ekranları (observability vb.). */
export const PREMIUM_PANEL_CARD_BASE =
  'group relative h-full overflow-hidden border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg transition-all duration-300';

const ACCENT_GRADIENT: Record<'cyan' | 'emerald' | 'amber' | 'primary' | 'violet', string> = {
  cyan: 'from-cyan-500 to-cyan-600',
  emerald: 'from-emerald-500 to-emerald-600',
  amber: 'from-amber-500 to-amber-600',
  primary: 'from-primary to-primary/75',
  violet: 'from-violet-500 to-violet-600',
};

export type PremiumPanelCardAccent = keyof typeof ACCENT_GRADIENT;

export function premiumPanelCardAccentClass(accent: PremiumPanelCardAccent): string {
  return cn('absolute left-0 top-0 h-full w-1 bg-gradient-to-b opacity-90', ACCENT_GRADIENT[accent]);
}
