'use client';

import { m } from 'framer-motion';
import { ReactNode } from 'react';

type GlowCardProps = {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  gradientBorder?: boolean;
  pulse?: boolean;
};

export function GlowCard(props: GlowCardProps) {
  const {
    children,
    className = '',
    glowColor = 'rgba(139, 92, 246, 0.4)',
    gradientBorder = false,
    pulse = false,
  } = props;
  const boxShadow = !gradientBorder && glowColor ? { boxShadow: `0 0 30px ${glowColor}` as const } : undefined;
  return (
    <m.div
      className="relative rounded-2xl"
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      whileHover={pulse ? { scale: 1.01 } : undefined}
      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
    >
      {gradientBorder && (
        <m.div
          className="absolute -inset-[1px] rounded-2xl opacity-90"
          style={{
            background: 'conic-gradient(from 0deg, hsl(262 83% 58%), hsl(292 84% 61%), hsl(262 83% 58%))',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />
      )}
      <div
        className={`relative rounded-2xl bg-card border border-border/60 overflow-hidden ${gradientBorder ? 'm-[1px]' : ''} ${pulse ? 'animate-glow-pulse' : ''} ${className}`}
        style={boxShadow}
      >
        {children}
      </div>
    </m.div>
  );
}
