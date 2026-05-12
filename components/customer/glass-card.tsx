'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hoverLift?: number;
  delay?: number;
}

export function GlassCard({ children, className = '', hoverLift = 4, delay = 0 }: GlassCardProps) {
  return (
    <motion.div
      className={`rounded-2xl border border-white/20 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-glass overflow-hidden ${className}`}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10px' }}
      transition={{ delay, type: 'spring', stiffness: 120, damping: 20 }}
      whileHover={{ y: -hoverLift, transition: { duration: 0.2 } }}
    >
      {children}
    </motion.div>
  );
}
