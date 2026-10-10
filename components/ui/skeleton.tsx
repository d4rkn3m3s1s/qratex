import { cn } from '@/lib/utils';

/**
 * Yükleme iskeleti. QDL kuralı (yol haritası §4.2): operasyon yüzeylerinde
 * iskelet STATİK — sonsuz shimmer yok (pil/GPU ve dikkat dağıtma). Play
 * yüzeylerinde `animated` ile yumuşak parıltı açılabilir; azaltılmış harekette
 * CSS politikası onu da durdurur.
 */
function Skeleton({
  className,
  animated = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { animated?: boolean }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted',
        animated && [
          'after:absolute after:inset-0 after:translate-x-[-100%]',
          'after:bg-gradient-to-r after:from-transparent after:via-white/10 after:to-transparent',
          'after:animate-shimmer',
        ],
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
