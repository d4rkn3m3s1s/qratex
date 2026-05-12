'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface GradientAnimationProps {
  children?: React.ReactNode;
  className?: string;
}

export function GradientAnimation({
  children,
  className,
}: GradientAnimationProps) {
  const colors = [
    '147, 51, 234', // primary (~hsl var(--primary))
    '168, 85, 247', // accent magenta
    '236, 72, 153',   // pink
    '59, 130, 246',   // blue
    '16, 185, 129',   // emerald
  ];

  return (
    <>
      {/* Fixed gradient background */}
      <div className={cn('fixed inset-0 pointer-events-none z-0', className)}>
        {/* Base dark gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-background" />
        
        {/* Animated gradient orbs */}
        <div className="absolute inset-0 overflow-hidden">
          {colors.map((color, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full blur-3xl"
              style={{
                background: `radial-gradient(circle, rgba(${color}, 0.4) 0%, rgba(${color}, 0) 70%)`,
                width: '60vw',
                height: '60vw',
              }}
              animate={{
                x: [
                  `${-20 + i * 10}vw`,
                  `${20 + i * 5}vw`,
                  `${-10 + i * 8}vw`,
                  `${-20 + i * 10}vw`,
                ],
                y: [
                  `${-10 + i * 15}vh`,
                  `${30 - i * 10}vh`,
                  `${-20 + i * 12}vh`,
                  `${-10 + i * 15}vh`,
                ],
                scale: [1, 1.2, 0.9, 1],
              }}
              transition={{
                duration: 15 + i * 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        {/* Noise overlay for texture */}
        <div className="absolute inset-0 opacity-20 mix-blend-overlay bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMC4xIi8+PC9zdmc+')]" />
      </div>
      {children}
    </>
  );
}
