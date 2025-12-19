'use client';

import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface GridDotsBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  variant?: 'grid' | 'dots' | 'grid-small';
  showGradient?: boolean;
}

export function GridDotsBackground({
  children,
  className,
  variant = 'grid',
  showGradient = true,
}: GridDotsBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const getPatternStyle = () => {
    switch (variant) {
      case 'dots':
        return {
          backgroundImage: `radial-gradient(circle, hsl(var(--primary) / 0.15) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        };
      case 'grid-small':
        return {
          backgroundImage: `
            linear-gradient(hsl(var(--primary) / 0.1) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--primary) / 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '16px 16px',
        };
      case 'grid':
      default:
        return {
          backgroundImage: `
            linear-gradient(hsl(var(--primary) / 0.1) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--primary) / 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        };
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative min-h-full w-full overflow-hidden bg-background',
        className
      )}
    >
      {/* Grid/Dots pattern */}
      <div
        className="absolute inset-0"
        style={getPatternStyle()}
      />

      {/* Gradient spotlight following mouse */}
      {showGradient && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, hsl(var(--primary) / 0.1), transparent 40%)`,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      )}

      {/* Fade edges */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background via-transparent to-background" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-background via-transparent to-background opacity-50" />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

