'use client';

import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { m as Motion } from 'framer-motion';

interface GridDotsBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  variant?: 'grid' | 'dots' | 'grid-small';
}

export function GridDotsBackground({
  children,
  className,
  variant = 'grid',
}: GridDotsBackgroundProps) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const getPatternStyle = () => {
    switch (variant) {
      case 'dots':
        return {
          backgroundImage: `radial-gradient(circle, hsl(var(--primary) / 0.3) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        };
      case 'grid-small':
        return {
          backgroundImage: `
            linear-gradient(hsl(var(--primary) / 0.15) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--primary) / 0.15) 1px, transparent 1px)
          `,
          backgroundSize: '16px 16px',
        };
      case 'grid':
      default:
        return {
          backgroundImage: `
            linear-gradient(hsl(var(--primary) / 0.15) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--primary) / 0.15) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        };
    }
  };

  return (
    <>
      {/* Fixed grid/dots background */}
      <div className={cn('fixed inset-0 pointer-events-none z-0', className)}>
        {/* Pattern layer */}
        <div className="absolute inset-0" style={getPatternStyle()} />

        {/* Mouse follow glow */}
        <Motion.div
          className="absolute w-[600px] h-[600px] rounded-full"
          animate={{
            x: mousePosition.x - 300,
            y: mousePosition.y - 300,
          }}
          transition={{ type: 'spring', stiffness: 150, damping: 20 }}
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)',
          }}
        />

        {/* Corner glows */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-radial from-primary/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-radial from-accent/10 to-transparent rounded-full blur-3xl" />
      </div>
      {children}
    </>
  );
}
