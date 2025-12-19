'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface MeteorProps {
  number?: number;
}

function Meteor({ delay }: { delay: number }) {
  const [position] = useState({
    top: Math.random() * 100,
    left: Math.random() * 100,
  });

  return (
    <motion.span
      className={cn(
        'absolute top-1/2 left-1/2 h-0.5 w-0.5 rotate-[215deg] animate-meteor-effect rounded-[9999px] bg-primary shadow-[0_0_0_1px_#ffffff10]',
        'before:content-[""] before:absolute before:top-1/2 before:-translate-y-1/2 before:w-[50px] before:h-[1px] before:bg-gradient-to-r before:from-primary before:to-transparent'
      )}
      style={{
        top: `${position.top}%`,
        left: `${position.left}%`,
      }}
      initial={{ opacity: 0, x: 0, y: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: [0, -300],
        y: [0, 300],
      }}
      transition={{
        duration: 1.5,
        delay: delay,
        repeat: Infinity,
        repeatDelay: Math.random() * 5 + 3,
        ease: 'linear',
      }}
    />
  );
}

interface MeteorsBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  number?: number;
}

export function MeteorsBackground({
  children,
  className,
  number = 20,
}: MeteorsBackgroundProps) {
  const [meteors, setMeteors] = useState<number[]>([]);

  useEffect(() => {
    setMeteors(Array.from({ length: number }, (_, i) => i));
  }, [number]);

  return (
    <div className={cn('relative min-h-full w-full overflow-hidden bg-background', className)}>
      {/* Stars */}
      <div className="absolute inset-0">
        {[...Array(100)].map((_, i) => (
          <div
            key={i}
            className="absolute w-px h-px bg-white/50 rounded-full"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      {/* Meteors */}
      <div className="absolute inset-0 overflow-hidden">
        {meteors.map((_, i) => (
          <Meteor key={i} delay={i * 0.3} />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>

      <style jsx>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

