'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface Snowflake {
  x: number;
  y: number;
  radius: number;
  speed: number;
  wind: number;
  opacity: number;
}

interface Light {
  x: number;
  y: number;
  color: string;
  phase: number;
  speed: number;
}

interface ChristmasBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function ChristmasBackground({
  children,
  className,
}: ChristmasBackgroundProps) {
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

    // Kar taneleri
    const snowflakes: Snowflake[] = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 3 + 1,
      speed: Math.random() * 2 + 0.5,
      wind: Math.random() * 0.5 - 0.25,
      opacity: Math.random() * 0.7 + 0.3,
    }));

    // Noel ışıkları
    const lightColors = ['#ff0000', '#00ff00', '#ffff00', '#ff00ff', '#00ffff', '#ff6600'];
    const lights: Light[] = Array.from({ length: 30 }, (_, i) => ({
      x: (i / 30) * canvas.width + Math.random() * 50,
      y: 20 + Math.sin(i * 0.5) * 15,
      color: lightColors[i % lightColors.length],
      phase: Math.random() * Math.PI * 2,
      speed: 0.05 + Math.random() * 0.03,
    }));

    let animationId: number;
    let time = 0;

    const animate = () => {
      // Arka plan
      const bgColor = isDark 
        ? 'rgba(10, 25, 47, 0.15)' 
        : 'rgba(240, 248, 255, 0.2)';
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Noel ışıkları kablosu
      ctx.beginPath();
      ctx.moveTo(0, 30);
      for (let i = 0; i <= canvas.width; i += 10) {
        ctx.lineTo(i, 25 + Math.sin(i * 0.02) * 10);
      }
      ctx.strokeStyle = isDark ? 'rgba(50, 50, 50, 0.8)' : 'rgba(100, 100, 100, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Işıkları çiz
      lights.forEach((light) => {
        const brightness = (Math.sin(time * light.speed + light.phase) + 1) / 2;
        const glowSize = 15 + brightness * 10;

        // Glow efekti
        const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, glowSize);
        gradient.addColorStop(0, light.color);
        gradient.addColorStop(0.3, light.color + '80');
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(light.x, light.y, glowSize, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.3 + brightness * 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Ampul
        ctx.beginPath();
        ctx.arc(light.x, light.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = light.color;
        ctx.fill();
      });

      // Kar tanelerini çiz
      const snowColor = isDark ? 'rgba(255, 255, 255,' : 'rgba(200, 220, 255,';
      
      snowflakes.forEach((flake) => {
        // Güncelle
        flake.y += flake.speed;
        flake.x += flake.wind + Math.sin(time * 0.01 + flake.x * 0.01) * 0.3;

        // Ekrandan çıkınca yukarıdan tekrar başla
        if (flake.y > canvas.height) {
          flake.y = -10;
          flake.x = Math.random() * canvas.width;
        }
        if (flake.x > canvas.width) flake.x = 0;
        if (flake.x < 0) flake.x = canvas.width;

        // Kar tanesi çiz
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${snowColor} ${flake.opacity})`;
        ctx.fill();

        // Parlama efekti
        if (flake.radius > 2) {
          ctx.beginPath();
          ctx.arc(flake.x, flake.y, flake.radius * 2, 0, Math.PI * 2);
          ctx.fillStyle = `${snowColor} ${flake.opacity * 0.2})`;
          ctx.fill();
        }
      });

      // Köşelerde kar birikintisi efekti
      const snowPileGradient = ctx.createLinearGradient(0, canvas.height - 50, 0, canvas.height);
      snowPileGradient.addColorStop(0, 'transparent');
      snowPileGradient.addColorStop(1, isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(200, 220, 255, 0.15)');
      ctx.fillStyle = snowPileGradient;
      ctx.fillRect(0, canvas.height - 50, canvas.width, 50);

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
    <div className={cn('relative flex flex-col h-full w-full items-center justify-center bg-background', className)}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

