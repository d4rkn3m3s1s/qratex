/**
 * Huninin buton sınıfları (sunucu ve istemci bileşenlerinde ortak; kancasız). Dokunma hedefi
 * ≥ 44px, görünür odak halkası, yalnız rol token'ları.
 */
import { cn } from '@/lib/utils';

const btnBase =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control px-4 qx-body font-semibold transition-[color,background-color,filter] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60';

export const btnPrimary = cn(btnBase, 'bg-brand text-brand-fg hover:brightness-110 active:brightness-95');
export const btnSecondary = cn(btnBase, 'border border-strong bg-surface-1 text-fg hover:bg-surface-3');
