'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface WavesBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  waveColors?: string[];
}

export function WavesBackground({
  children,
  className,
  waveColors = ['rgba(139, 92, 246, 0.3)', 'rgba(217, 70, 239, 0.2)', 'rgba(244, 114, 182, 0.15)'],
}: WavesBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    let time = 0;
    let animationId: number;

    const waves = waveColors.map((color, i) => ({
      color,
      amplitude: 50 + i * 20,
      frequency: 0.005 + i * 0.002,
      speed: 0.02 + i * 0.01,
      offset: i * 100,
    }));

    const bgColor = isDark ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.05)';

    const animate = () => {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      waves.forEach((wave) => {
        ctx.beginPath();
        ctx.moveTo(0, canvas.height);

        for (let x = 0; x <= canvas.width; x += 5) {
          const y =
            canvas.height * 0.5 +
            Math.sin(x * wave.frequency + time * wave.speed) * wave.amplitude +
            Math.sin(x * wave.frequency * 2 + time * wave.speed * 1.5) * (wave.amplitude * 0.5) +
            wave.offset;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(canvas.width, canvas.height);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.5, wave.color);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.fill();
      });

      time += 1;
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [waveColors, isDark]);

  return (
    <div className={cn('relative flex flex-col h-full w-full items-center justify-center bg-background', className)}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

