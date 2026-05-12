'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { HEX_WHITE } from '@/lib/brand-colors';
import { NEBULA_STAR_ACCENT_COLORS } from '@/lib/decorative-canvas-colors';
import { cn } from '@/lib/utils';

interface NebulaBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function NebulaBackground({ children, className }: NebulaBackgroundProps) {
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

    // Stars
    interface Star {
      x: number;
      y: number;
      radius: number;
      alpha: number;
      alphaSpeed: number;
      color: string;
    }

    const starColors = [HEX_WHITE, ...NEBULA_STAR_ACCENT_COLORS];
    const stars: Star[] = Array.from({ length: 200 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.5 + 0.5,
      alpha: Math.random(),
      alphaSpeed: 0.005 + Math.random() * 0.01,
      color: starColors[Math.floor(Math.random() * starColors.length)],
    }));

    // Nebula clouds
    interface Cloud {
      x: number;
      y: number;
      radius: number;
      color: string;
      alpha: number;
      vx: number;
      vy: number;
    }

    const nebulaColors = isDark
      ? ['rgba(139, 92, 246, 0.15)', 'rgba(236, 72, 153, 0.12)', 'rgba(59, 130, 246, 0.1)', 'rgba(16, 185, 129, 0.08)']
      : ['rgba(139, 92, 246, 0.1)', 'rgba(236, 72, 153, 0.08)', 'rgba(59, 130, 246, 0.06)', 'rgba(16, 185, 129, 0.05)'];

    const clouds: Cloud[] = Array.from({ length: 8 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: 200 + Math.random() * 300,
      color: nebulaColors[Math.floor(Math.random() * nebulaColors.length)],
      alpha: 0.3 + Math.random() * 0.4,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
    }));

    // Shooting stars
    interface ShootingStar {
      x: number;
      y: number;
      length: number;
      speed: number;
      active: boolean;
      alpha: number;
    }

    const shootingStars: ShootingStar[] = Array.from({ length: 3 }, () => ({
      x: 0,
      y: 0,
      length: 80 + Math.random() * 60,
      speed: 8 + Math.random() * 6,
      active: false,
      alpha: 0,
    }));

    let animationId: number;
    let time = 0;

    const animate = () => {
      // Clear with fade effect
      ctx.fillStyle = isDark ? 'rgba(5, 5, 15, 0.1)' : 'rgba(240, 240, 255, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw nebula clouds
      clouds.forEach((cloud) => {
        cloud.x += cloud.vx;
        cloud.y += cloud.vy;

        // Wrap around
        if (cloud.x < -cloud.radius) cloud.x = canvas.width + cloud.radius;
        if (cloud.x > canvas.width + cloud.radius) cloud.x = -cloud.radius;
        if (cloud.y < -cloud.radius) cloud.y = canvas.height + cloud.radius;
        if (cloud.y > canvas.height + cloud.radius) cloud.y = -cloud.radius;

        const gradient = ctx.createRadialGradient(
          cloud.x, cloud.y, 0,
          cloud.x, cloud.y, cloud.radius
        );
        gradient.addColorStop(0, cloud.color);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      // Draw stars with twinkling
      stars.forEach((star) => {
        star.alpha += star.alphaSpeed;
        if (star.alpha >= 1 || star.alpha <= 0.2) {
          star.alphaSpeed *= -1;
        }

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = star.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Star glow
        if (star.radius > 1) {
          const glow = ctx.createRadialGradient(
            star.x, star.y, 0,
            star.x, star.y, star.radius * 4
          );
          glow.addColorStop(0, star.color);
          glow.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.radius * 4, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.globalAlpha = star.alpha * 0.3;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      });

      // Shooting stars
      shootingStars.forEach((ss) => {
        if (!ss.active && Math.random() < 0.002) {
          ss.active = true;
          ss.x = Math.random() * canvas.width;
          ss.y = Math.random() * canvas.height * 0.5;
          ss.alpha = 1;
        }

        if (ss.active) {
          const gradient = ctx.createLinearGradient(
            ss.x, ss.y,
            ss.x - ss.length, ss.y + ss.length * 0.5
          );
          gradient.addColorStop(0, `rgba(255, 255, 255, ${ss.alpha})`);
          gradient.addColorStop(1, 'transparent');

          ctx.beginPath();
          ctx.moveTo(ss.x, ss.y);
          ctx.lineTo(ss.x - ss.length, ss.y + ss.length * 0.5);
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 2;
          ctx.stroke();

          ss.x += ss.speed;
          ss.y += ss.speed * 0.5;
          ss.alpha -= 0.02;

          if (ss.alpha <= 0 || ss.x > canvas.width || ss.y > canvas.height) {
            ss.active = false;
          }
        }
      });

      time++;
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isDark]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={cn('fixed inset-0 z-0 pointer-events-none', className)}
      />
      {children}
    </>
  );
}
