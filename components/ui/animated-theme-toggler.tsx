'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedThemeTogglerProps {
  className?: string;
  duration?: number;
}

export function AnimatedThemeToggler({
  className,
  duration = 400,
}: AnimatedThemeTogglerProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          'h-9 w-9 rounded-full bg-muted animate-pulse',
          className
        )}
      />
    );
  }

  const isDark = resolvedTheme === 'dark';

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <motion.button
      onClick={toggleTheme}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-full',
        'bg-gradient-to-br transition-colors duration-300',
        isDark
          ? 'from-violet-600/20 to-purple-600/20 hover:from-violet-600/30 hover:to-purple-600/30'
          : 'from-amber-400/20 to-orange-400/20 hover:from-amber-400/30 hover:to-orange-400/30',
        'border border-border/50',
        className
      )}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: duration / 1000 }}
      aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
    >
      <AnimatePresence mode="wait">
        {isDark ? (
          <motion.div
            key="moon"
            initial={{ opacity: 0, rotate: -90, scale: 0 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0 }}
            transition={{ duration: duration / 1000, ease: 'easeInOut' }}
          >
            {/* Moon Icon */}
            <svg
              className="h-5 w-5 text-violet-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <motion.path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: duration / 1000, delay: 0.1 }}
              />
            </svg>
            {/* Stars */}
            <motion.span
              className="absolute top-1 right-1 h-1 w-1 rounded-full bg-violet-400"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.2 }}
            />
            <motion.span
              className="absolute top-2 right-2.5 h-0.5 w-0.5 rounded-full bg-purple-400"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.2 }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ opacity: 0, rotate: 90, scale: 0 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -90, scale: 0 }}
            transition={{ duration: duration / 1000, ease: 'easeInOut' }}
            className="relative"
          >
            {/* Sun Icon */}
            <svg
              className="h-5 w-5 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <motion.circle
                cx="12"
                cy="12"
                r="5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: duration / 1000 }}
              />
              {/* Sun rays */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                <motion.line
                  key={angle}
                  x1={12 + 8 * Math.cos((angle * Math.PI) / 180)}
                  y1={12 + 8 * Math.sin((angle * Math.PI) / 180)}
                  x2={12 + 10 * Math.cos((angle * Math.PI) / 180)}
                  y2={12 + 10 * Math.sin((angle * Math.PI) / 180)}
                  strokeLinecap="round"
                  initial={{ opacity: 0, pathLength: 0 }}
                  animate={{ opacity: 1, pathLength: 1 }}
                  transition={{
                    delay: 0.1 + i * 0.05,
                    duration: 0.2,
                  }}
                />
              ))}
            </svg>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
