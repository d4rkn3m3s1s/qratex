'use client';

import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';

/**
 * Magic UI–style gradient CTA card. Use for landing blocks or feature highlights.
 */
export function GradientCTACard({
  className,
  innerClassName,
  children,
  gradientFrom = 'from-primary',
  gradientVia = 'via-primary/85',
  gradientTo = 'to-primary/70',
}: {
  className?: string;
  /** İç container (varsayılan: p-6 md:p-8) */
  innerClassName?: string;
  children: ReactNode;
  gradientFrom?: string;
  gradientVia?: string;
  gradientTo?: string;
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl bg-gradient-to-br p-[1px] shadow-xl transition-shadow duration-200 motion-reduce:transition-none hover:shadow-2xl hover:shadow-primary/20',
        gradientFrom,
        gradientVia,
        gradientTo,
        className
      )}
    >
      <div
        className={cn(
          'relative rounded-2xl border border-white/5 bg-background/95 backdrop-blur transition-[border-color,background-color] duration-200 motion-reduce:transition-none group-hover:border-white/15 dark:group-hover:border-white/12',
          innerClassName ?? 'p-6 md:p-8'
        )}
      >
        {children}
      </div>
    </div>
  );
}
