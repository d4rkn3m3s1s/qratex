'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface Star {
  x: number;
  y: number;
  z: number;
  pz: number;
}

interface StarfieldBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  starCount?: number;
  speed?: number;
}

export function StarfieldBackground({
  children,
  className,
  starCount = 400,
  speed = 2,
}: StarfieldBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const stars: Star[] = Array.from({ length: starCount }, () => ({
      x: Math.random() * width - width / 2,
      y: Math.random() * height - height / 2,
      z: Math.random() * width,
      pz: 0,
    }));

    let animationId: number;

    const bgColor = isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.25)';
    const starColor = isDark ? 'rgba(255, 255, 255,' : 'rgba(30, 30, 30,';
    const trailStartColor = isDark ? 'rgba(139, 92, 246,' : 'rgba(109, 40, 217,';

    const animate = () => {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      stars.forEach((star) => {
        star.pz = star.z;
        star.z -= speed;

        if (star.z < 1) {
          star.x = Math.random() * width - cx;
          star.y = Math.random() * height - cy;
          star.z = width;
          star.pz = width;
        }

        const sx = (star.x / star.z) * width + cx;
        const sy = (star.y / star.z) * height + cy;
        const px = (star.x / star.pz) * width + cx;
        const py = (star.y / star.pz) * height + cy;

        const size = (1 - star.z / width) * 3;

        // Draw star trail
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx, sy);

        const brightness = 1 - star.z / width;
        const gradient = ctx.createLinearGradient(px, py, sx, sy);
        gradient.addColorStop(0, `${trailStartColor} ${brightness * 0.3})`);
        gradient.addColorStop(1, `${starColor} ${brightness})`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = size;
        ctx.stroke();

        // Draw star point
        ctx.beginPath();
        ctx.arc(sx, sy, size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `${starColor} ${brightness})`;
        ctx.fill();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [starCount, speed, isDark]);

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

