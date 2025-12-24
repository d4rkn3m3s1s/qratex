'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface Heart {
  x: number;
  y: number;
  size: number;
  speed: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  opacity: number;
  swing: number;
  swingSpeed: number;
}

interface ValentineBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function ValentineBackground({
  children,
  className,
}: ValentineBackgroundProps) {
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

    const darkColors = ['#ff1744', '#ff4081', '#f50057', '#ff80ab', '#ff5252', '#e91e63'];
    const lightColors = ['#e91e63', '#c2185b', '#ad1457', '#880e4f', '#d81b60', '#f06292'];
    const colors = isDark ? darkColors : lightColors;

    const hearts: Heart[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height + canvas.height,
      size: 10 + Math.random() * 25,
      speed: 0.5 + Math.random() * 1.5,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 0.3 + Math.random() * 0.5,
      swing: Math.random() * Math.PI * 2,
      swingSpeed: 0.02 + Math.random() * 0.02,
    }));

    // Parıltılar
    interface Sparkle {
      x: number;
      y: number;
      size: number;
      alpha: number;
      alphaSpeed: number;
    }

    const sparkles: Sparkle[] = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: 1 + Math.random() * 2,
      alpha: Math.random(),
      alphaSpeed: 0.02 + Math.random() * 0.03,
    }));

    const drawHeart = (x: number, y: number, size: number, rotation: number, color: string, opacity: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.globalAlpha = opacity;

      ctx.beginPath();
      ctx.moveTo(0, size * 0.3);
      ctx.bezierCurveTo(
        -size * 0.5, -size * 0.3,
        -size, size * 0.1,
        0, size
      );
      ctx.bezierCurveTo(
        size, size * 0.1,
        size * 0.5, -size * 0.3,
        0, size * 0.3
      );
      ctx.closePath();

      // Gradient fill
      const gradient = ctx.createRadialGradient(0, size * 0.3, 0, 0, size * 0.3, size);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color + '40');
      ctx.fillStyle = gradient;
      ctx.fill();

      // Parlak kenar
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    };

    let animationId: number;
    let time = 0;

    const animate = () => {
      // Arka plan
      const bgColor = isDark 
        ? 'rgba(20, 5, 15, 0.08)' 
        : 'rgba(255, 240, 245, 0.12)';
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Parıltıları çiz
      sparkles.forEach((s) => {
        s.alpha += s.alphaSpeed;
        if (s.alpha >= 1 || s.alpha <= 0) s.alphaSpeed *= -1;
        s.alpha = Math.max(0, Math.min(1, s.alpha));

        const sparkleColor = isDark ? '255, 182, 193' : '219, 112, 147';
        
        ctx.beginPath();
        // 4 köşeli yıldız
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI / 2) + time * 0.02;
          const innerRadius = s.size * 0.3;
          const outerRadius = s.size;
          
          ctx.lineTo(
            s.x + Math.cos(angle) * outerRadius,
            s.y + Math.sin(angle) * outerRadius
          );
          ctx.lineTo(
            s.x + Math.cos(angle + Math.PI / 4) * innerRadius,
            s.y + Math.sin(angle + Math.PI / 4) * innerRadius
          );
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(${sparkleColor}, ${s.alpha * 0.8})`;
        ctx.fill();
      });

      // Kalpleri çiz
      hearts.forEach((heart) => {
        heart.y -= heart.speed;
        heart.x += Math.sin(heart.swing) * 0.5;
        heart.swing += heart.swingSpeed;
        heart.rotation += heart.rotationSpeed;

        if (heart.y < -heart.size * 2) {
          heart.y = canvas.height + heart.size * 2;
          heart.x = Math.random() * canvas.width;
        }

        drawHeart(heart.x, heart.y, heart.size, heart.rotation, heart.color, heart.opacity);
      });

      // Köşelerde romantik glow
      const cornerColors = isDark 
        ? ['rgba(255, 20, 100, 0.15)', 'rgba(255, 64, 129, 0.1)']
        : ['rgba(219, 112, 147, 0.1)', 'rgba(255, 182, 193, 0.08)'];

      // Sol üst
      const gradient1 = ctx.createRadialGradient(0, 0, 0, 0, 0, 300);
      gradient1.addColorStop(0, cornerColors[0]);
      gradient1.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient1;
      ctx.fillRect(0, 0, 300, 300);

      // Sağ alt
      const gradient2 = ctx.createRadialGradient(canvas.width, canvas.height, 0, canvas.width, canvas.height, 300);
      gradient2.addColorStop(0, cornerColors[1]);
      gradient2.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient2;
      ctx.fillRect(canvas.width - 300, canvas.height - 300, 300, 300);

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

