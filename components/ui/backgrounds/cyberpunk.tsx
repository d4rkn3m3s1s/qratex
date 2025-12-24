'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface CyberpunkBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function CyberpunkBackground({
  children,
  className,
}: CyberpunkBackgroundProps) {
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

    const colors = ['#8b5cf6', '#d946ef', '#06b6d4', '#f472b6', '#818cf8'];
    
    interface Line {
      x: number;
      y: number;
      length: number;
      speed: number;
      color: string;
      direction: 'horizontal' | 'vertical';
      opacity: number;
      width: number;
    }

    const lines: Line[] = [];
    const maxLines = 30;

    const createLine = (): Line => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      length: 50 + Math.random() * 200,
      speed: 2 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      direction: Math.random() > 0.5 ? 'horizontal' : 'vertical',
      opacity: 0.3 + Math.random() * 0.7,
      width: 1 + Math.random() * 2,
    });

    // Initialize lines
    for (let i = 0; i < maxLines; i++) {
      lines.push(createLine());
    }

    let animationId: number;

    const bgColor = isDark ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)';
    const gridColor = isDark ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.2)';
    const glowColor = isDark ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.15)';

    const animate = () => {
      // Fade effect
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 0.5;
      const gridSize = 50;

      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Update and draw lines
      lines.forEach((line, index) => {
        ctx.beginPath();

        if (line.direction === 'horizontal') {
          const gradient = ctx.createLinearGradient(
            line.x - line.length / 2, line.y,
            line.x + line.length / 2, line.y
          );
          gradient.addColorStop(0, 'transparent');
          gradient.addColorStop(0.5, line.color);
          gradient.addColorStop(1, 'transparent');

          ctx.strokeStyle = gradient;
          ctx.lineWidth = line.width;
          ctx.moveTo(line.x - line.length / 2, line.y);
          ctx.lineTo(line.x + line.length / 2, line.y);

          line.x += line.speed;
          if (line.x - line.length / 2 > canvas.width) {
            lines[index] = createLine();
            lines[index].x = -lines[index].length / 2;
          }
        } else {
          const gradient = ctx.createLinearGradient(
            line.x, line.y - line.length / 2,
            line.x, line.y + line.length / 2
          );
          gradient.addColorStop(0, 'transparent');
          gradient.addColorStop(0.5, line.color);
          gradient.addColorStop(1, 'transparent');

          ctx.strokeStyle = gradient;
          ctx.lineWidth = line.width;
          ctx.moveTo(line.x, line.y - line.length / 2);
          ctx.lineTo(line.x, line.y + line.length / 2);

          line.y += line.speed;
          if (line.y - line.length / 2 > canvas.height) {
            lines[index] = createLine();
            lines[index].y = -lines[index].length / 2;
          }
        }

        ctx.globalAlpha = line.opacity;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Draw glowing corners
      const cornerGlow = (x: number, y: number) => {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 200);
        gradient.addColorStop(0, glowColor);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - 200, y - 200, 400, 400);
      };

      cornerGlow(0, 0);
      cornerGlow(canvas.width, canvas.height);

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

