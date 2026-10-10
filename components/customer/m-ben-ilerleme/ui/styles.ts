import { FOCUS_RING } from '@/components/ds/play/shared';
import { cn } from '@/lib/utils';

/** Metin bağlantısı: ≥ 44px dokunma hedefi + QDL odak halkası. */
export const TEXT_LINK = cn(
  'qx-small inline-flex min-h-11 items-center gap-1 rounded-control font-medium text-brand-text underline-offset-4 hover:underline',
  FOCUS_RING,
);

/** Kart içi ikincil düğme görünümlü bağlantı. */
export const SOFT_BUTTON = cn(
  'qx-small inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-brand-border/60 bg-brand-subtle px-4 font-medium text-brand-text',
  'transition-colors duration-fast ease-standard hover:bg-brand-subtle/70',
  FOCUS_RING,
);

export { FOCUS_RING };
