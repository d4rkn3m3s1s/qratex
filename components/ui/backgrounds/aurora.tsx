'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface AuroraBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  showRadialGradient?: boolean;
}

export function AuroraBackground({
  children,
  className,
  showRadialGradient = true,
}: AuroraBackgroundProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col h-full w-full items-center justify-center bg-background text-foreground transition-bg',
        className
      )}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={cn(
            'pointer-events-none absolute -inset-[10px] opacity-50',
            '[--aurora:repeating-linear-gradient(100deg,var(--primary)_10%,var(--accent)_15%,var(--primary)_20%,var(--accent)_25%,var(--primary)_30%)]',
            '[--dark-gradient:repeating-linear-gradient(100deg,var(--background)_0%,var(--background)_7%,transparent_10%,transparent_12%,var(--background)_16%)]',
            '[--light-gradient:repeating-linear-gradient(100deg,var(--background)_0%,var(--background)_7%,transparent_10%,transparent_12%,var(--background)_16%)]',
            '[background-image:var(--light-gradient),var(--aurora)]',
            'dark:[background-image:var(--dark-gradient),var(--aurora)]',
            '[background-size:300%,_200%]',
            '[background-position:50%_50%,50%_50%]',
            'filter blur-[10px] invert dark:invert-0',
            'after:content-[""] after:absolute after:inset-0 after:[background-image:var(--light-gradient),var(--aurora)]',
            'after:dark:[background-image:var(--dark-gradient),var(--aurora)]',
            'after:[background-size:200%,_100%]',
            'after:animate-aurora after:[background-attachment:fixed] after:mix-blend-difference',
            showRadialGradient &&
              '[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,transparent_70%)]'
          )}
        />
      </div>
      {children}
    </div>
  );
}
