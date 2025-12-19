'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface GradientAnimationProps {
  children?: React.ReactNode;
  className?: string;
  gradientBackgroundStart?: string;
  gradientBackgroundEnd?: string;
  firstColor?: string;
  secondColor?: string;
  thirdColor?: string;
  fourthColor?: string;
  fifthColor?: string;
  pointerColor?: string;
  size?: string;
  blendingValue?: string;
  interactive?: boolean;
}

export function GradientAnimation({
  children,
  className,
  gradientBackgroundStart = 'rgb(10, 10, 11)',
  gradientBackgroundEnd = 'rgb(10, 10, 11)',
  firstColor = '139, 92, 246',
  secondColor = '168, 85, 247',
  thirdColor = '236, 72, 153',
  fourthColor = '34, 197, 94',
  fifthColor = '59, 130, 246',
  pointerColor = '140, 100, 255',
  size = '80%',
  blendingValue = 'hard-light',
  interactive = true,
}: GradientAnimationProps) {
  return (
    <div
      className={cn(
        'relative min-h-full w-full overflow-hidden bg-background',
        className
      )}
    >
      <svg className="hidden">
        <defs>
          <filter id="blurMe">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(40deg, ${gradientBackgroundStart}, ${gradientBackgroundEnd})`,
        }}
      />

      <div className="absolute inset-0 [filter:url(#blurMe)_blur(40px)]">
        {/* First gradient */}
        <motion.div
          className="absolute opacity-100"
          style={{
            background: `radial-gradient(circle at center, rgba(${firstColor}, 0.8) 0, rgba(${firstColor}, 0) 50%)`,
            width: size,
            height: size,
            top: 'calc(50% - 40%)',
            left: 'calc(50% - 40%)',
            mixBlendMode: blendingValue as any,
          }}
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Second gradient */}
        <motion.div
          className="absolute opacity-100"
          style={{
            background: `radial-gradient(circle at center, rgba(${secondColor}, 0.8) 0, rgba(${secondColor}, 0) 50%)`,
            width: size,
            height: size,
            top: 'calc(50% - 40%)',
            left: 'calc(50% - 40%)',
            mixBlendMode: blendingValue as any,
          }}
          animate={{
            x: [0, -100, 0],
            y: [0, 100, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Third gradient */}
        <motion.div
          className="absolute opacity-100"
          style={{
            background: `radial-gradient(circle at center, rgba(${thirdColor}, 0.8) 0, rgba(${thirdColor}, 0) 50%)`,
            width: size,
            height: size,
            top: 'calc(50% - 40%)',
            left: 'calc(50% - 40%)',
            mixBlendMode: blendingValue as any,
          }}
          animate={{
            x: [0, 50, 0],
            y: [0, -100, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Fourth gradient */}
        <motion.div
          className="absolute opacity-70"
          style={{
            background: `radial-gradient(circle at center, rgba(${fourthColor}, 0.8) 0, rgba(${fourthColor}, 0) 50%)`,
            width: size,
            height: size,
            top: 'calc(50% - 40%)',
            left: 'calc(50% - 40%)',
            mixBlendMode: blendingValue as any,
          }}
          animate={{
            x: [0, -50, 0],
            y: [0, -50, 0],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Fifth gradient */}
        <motion.div
          className="absolute opacity-70"
          style={{
            background: `radial-gradient(circle at center, rgba(${fifthColor}, 0.8) 0, rgba(${fifthColor}, 0) 50%)`,
            width: size,
            height: size,
            top: 'calc(50% - 40%)',
            left: 'calc(50% - 40%)',
            mixBlendMode: blendingValue as any,
          }}
          animate={{
            x: [0, 75, 0],
            y: [0, 75, 0],
          }}
          transition={{
            duration: 22,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

