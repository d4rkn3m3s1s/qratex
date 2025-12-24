'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  alphaChange: number;
  color: string;
}

interface FirefliesBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  count?: number;
}

export function FirefliesBackground({
  children,
  className,
  count = 50,
}: FirefliesBackgroundProps) {
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

    const darkColors = ['#fbbf24', '#f59e0b', '#d97706', '#fcd34d', '#fef3c7'];
    const lightColors = ['#ea580c', '#c2410c', '#9a3412', '#f97316', '#fb923c'];
    const colors = isDark ? darkColors : lightColors;

    const fireflies: Firefly[] = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      radius: 2 + Math.random() * 3,
      alpha: Math.random(),
      alphaChange: 0.01 + Math.random() * 0.02,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    let animationId: number;

    const bgColor = isDark ? 'rgba(0, 10, 20, 0.1)' : 'rgba(255, 252, 245, 0.15)';
    const glowInner = isDark ? 'rgba(251, 191, 36,' : 'rgba(234, 88, 12,';
    const glowOuter = isDark ? 'rgba(245, 158, 11,' : 'rgba(194, 65, 12,';

    const animate = () => {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      fireflies.forEach((f) => {
        // Random direction changes
        if (Math.random() < 0.02) {
          f.vx = (Math.random() - 0.5) * 0.5;
          f.vy = (Math.random() - 0.5) * 0.5;
        }

        // Update position
        f.x += f.vx;
        f.y += f.vy;

        // Alpha pulsing
        f.alpha += f.alphaChange;
        if (f.alpha >= 1 || f.alpha <= 0) {
          f.alphaChange *= -1;
        }
        f.alpha = Math.max(0, Math.min(1, f.alpha));

        // Wrap around edges
        if (f.x < 0) f.x = canvas.width;
        if (f.x > canvas.width) f.x = 0;
        if (f.y < 0) f.y = canvas.height;
        if (f.y > canvas.height) f.y = 0;

        // Draw glow
        const gradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius * 8);
        gradient.addColorStop(0, `${glowInner} ${f.alpha * 0.5})`);
        gradient.addColorStop(0.5, `${glowOuter} ${f.alpha * 0.2})`);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius * 8, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw core
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        const coreColor = isDark ? `rgba(255, 255, 255, ${f.alpha})` : `rgba(120, 53, 15, ${f.alpha})`;
        ctx.fillStyle = coreColor;
        ctx.fill();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [count, isDark]);

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

