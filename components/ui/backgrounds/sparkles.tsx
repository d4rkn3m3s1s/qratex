'use client';

import { useEffect, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SparklesCoreProps {
  id?: string;
  background?: string;
  minSize?: number;
  maxSize?: number;
  particleDensity?: number;
  className?: string;
  particleColor?: string;
  speed?: 'slow' | 'medium' | 'fast';
}

export function SparklesCore({
  id = 'sparkles',
  background = 'transparent',
  minSize = 0.4,
  maxSize = 1,
  particleDensity = 100,
  className,
  particleColor = 'hsl(var(--primary))',
  speed = 'medium',
}: SparklesCoreProps) {
  const [particles, setParticles] = useState<
    Array<{ id: number; x: number; y: number; size: number; duration: number; delay: number }>
  >([]);

  useEffect(() => {
    const speedMultiplier = speed === 'slow' ? 2 : speed === 'fast' ? 0.5 : 1;
    const newParticles = Array.from({ length: particleDensity }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * (maxSize - minSize) + minSize,
      duration: (Math.random() * 2 + 1) * speedMultiplier,
      delay: Math.random() * 2,
    }));
    setParticles(newParticles);
  }, [particleDensity, minSize, maxSize, speed]);

  return (
    <div
      className={cn('h-full w-full absolute inset-0 overflow-hidden', className)}
      style={{ background }}
    >
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <filter id={`glow-${id}`}>
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {particles.map((particle) => (
          <motion.circle
            key={particle.id}
            cx={`${particle.x}%`}
            cy={`${particle.y}%`}
            r={particle.size}
            fill={particleColor}
            filter={`url(#glow-${id})`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              delay: particle.delay,
              ease: 'easeInOut',
            }}
          />
        ))}
      </svg>
    </div>
  );
}

interface SparklesBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  particleColor?: string;
  particleDensity?: number;
}

export function SparklesBackground({
  children,
  className,
  particleColor,
  particleDensity = 80,
}: SparklesBackgroundProps) {
  return (
    <div className={cn('relative min-h-full w-full', className)}>
      <SparklesCore
        particleColor={particleColor}
        particleDensity={particleDensity}
        className="z-0"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
