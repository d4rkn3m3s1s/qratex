'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { GALAXY_SPIRAL_ARM_COLORS } from '@/lib/decorative-canvas-colors';
import { cn } from '@/lib/utils';

interface GalaxyBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function GalaxyBackground({ children, className }: GalaxyBackgroundProps) {
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

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Galaxy stars in spiral
    interface GalaxyStar {
      angle: number;
      distance: number;
      speed: number;
      size: number;
      color: string;
      brightness: number;
      arm: number;
    }

    const armColors = GALAXY_SPIRAL_ARM_COLORS;

    const galaxyStars: GalaxyStar[] = [];
    const numArms = 4;
    const starsPerArm = 150;

    for (let arm = 0; arm < numArms; arm++) {
      const armAngle = (arm / numArms) * Math.PI * 2;
      const colors = armColors[arm % armColors.length];

      for (let i = 0; i < starsPerArm; i++) {
        const distance = 50 + (i / starsPerArm) * Math.min(canvas.width, canvas.height) * 0.45;
        const spread = (Math.random() - 0.5) * 60;
        const angleOffset = (i / starsPerArm) * Math.PI * 1.5;

        galaxyStars.push({
          angle: armAngle + angleOffset + (Math.random() - 0.5) * 0.3,
          distance: distance + spread,
          speed: 0.0005 + (1 - i / starsPerArm) * 0.001,
          size: 0.5 + Math.random() * 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          brightness: 0.3 + Math.random() * 0.7,
          arm,
        });
      }
    }

    // Background stars
    interface BackgroundStar {
      x: number;
      y: number;
      size: number;
      alpha: number;
      twinkleSpeed: number;
    }

    const backgroundStars: BackgroundStar[] = Array.from({ length: 200 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.5,
      alpha: Math.random(),
      twinkleSpeed: 0.01 + Math.random() * 0.02,
    }));

    // Cosmic dust
    interface Dust {
      x: number;
      y: number;
      radius: number;
      color: string;
      alpha: number;
    }

    const dustClouds: Dust[] = Array.from({ length: 15 }, () => ({
      x: centerX + (Math.random() - 0.5) * canvas.width * 0.8,
      y: centerY + (Math.random() - 0.5) * canvas.height * 0.8,
      radius: 100 + Math.random() * 200,
      color: ['rgba(139, 92, 246,', 'rgba(236, 72, 153,', 'rgba(59, 130, 246,'][Math.floor(Math.random() * 3)],
      alpha: 0.03 + Math.random() * 0.05,
    }));

    let animationId: number;
    let time = 0;

    const animate = () => {
      // Clear
      ctx.fillStyle = isDark ? 'rgba(5, 5, 15, 0.1)' : 'rgba(240, 240, 250, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw cosmic dust
      dustClouds.forEach((dust) => {
        const gradient = ctx.createRadialGradient(
          dust.x, dust.y, 0,
          dust.x, dust.y, dust.radius
        );
        gradient.addColorStop(0, `${dust.color} ${dust.alpha})`);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(dust.x, dust.y, dust.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      // Draw background stars
      backgroundStars.forEach((star) => {
        star.alpha += star.twinkleSpeed;
        if (star.alpha > 1 || star.alpha < 0.2) star.twinkleSpeed *= -1;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * (isDark ? 0.8 : 0.5)})`;
        ctx.fill();
      });

      // Draw galaxy spiral
      galaxyStars.forEach((star) => {
        star.angle += star.speed;

        const x = centerX + Math.cos(star.angle) * star.distance;
        const y = centerY + Math.sin(star.angle) * star.distance * 0.6; // Flatten for perspective

        // Brightness varies with position (front/back of galaxy)
        const depthFactor = (Math.sin(star.angle) + 1) / 2;
        const alpha = star.brightness * (0.3 + depthFactor * 0.7) * (isDark ? 1 : 0.7);

        ctx.beginPath();
        ctx.arc(x, y, star.size * (0.5 + depthFactor * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = alpha;
        ctx.fill();

        // Glow for larger stars
        if (star.size > 1.5) {
          ctx.beginPath();
          ctx.arc(x, y, star.size * 3, 0, Math.PI * 2);
          const glow = ctx.createRadialGradient(x, y, 0, x, y, star.size * 3);
          glow.addColorStop(0, star.color);
          glow.addColorStop(1, 'transparent');
          ctx.fillStyle = glow;
          ctx.globalAlpha = alpha * 0.3;
          ctx.fill();
        }

        ctx.globalAlpha = 1;
      });

      // Galaxy center glow
      const coreGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, 100
      );
      const coreAlpha = isDark ? 0.4 : 0.25;
      coreGradient.addColorStop(0, `rgba(255, 255, 255, ${coreAlpha})`);
      coreGradient.addColorStop(0.3, `rgba(255, 200, 150, ${coreAlpha * 0.5})`);
      coreGradient.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.arc(centerX, centerY, 100, 0, Math.PI * 2);
      ctx.fillStyle = coreGradient;
      ctx.fill();

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
