'use client';

import { HEX_WHITE } from '@/lib/brand-colors';
import { cn } from '@/lib/utils';

/**
 * Aceternity UI–style spotlight effect. Use behind hero/CTA content to draw attention.
 * Tailwind keyframes: spotlight (see tailwind.config.ts).
 */
export function Spotlight({
  className,
  fill = HEX_WHITE,
}: {
  className?: string;
  fill?: string;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-[1] overflow-hidden',
        className
      )}
    >
      <div
        className="absolute -top-[40%] -left-[40%] h-[80vh] w-[80vw] rounded-full opacity-0 animate-spotlight"
        style={{
          background: `radial-gradient(ellipse at center, ${fill}40, transparent 70%)`,
        }}
      />
    </div>
  );
}
