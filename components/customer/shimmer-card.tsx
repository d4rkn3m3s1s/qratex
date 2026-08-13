'use client';

import { m as Motion } from 'framer-motion';
import { type ReactNode } from 'react';

interface ShimmerCardProps {
  children: ReactNode;
  className?: string;
}

export function ShimmerCard({ children, className = '' }: ShimmerCardProps) {
  return (
    <Motion.div
      className={`group relative overflow-hidden rounded-2xl border border-border/50 bg-card ${className}`}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
    >
      <div className="absolute inset-0 overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none">
        <div className="absolute inset-y-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-15deg] group-hover:animate-shine" />
      </div>
      {children}
    </Motion.div>
  );
}
