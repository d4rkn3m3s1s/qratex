'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface AuroraBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function AuroraBackground({ children, className }: AuroraBackgroundProps) {
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

    // Mystical aurora ribbons
    interface Ribbon {
      points: { x: number; y: number; vx: number; vy: number }[];
      hue: number;
      hueSpeed: number;
      width: number;
      alpha: number;
    }

    const ribbons: Ribbon[] = [];
    const numRibbons = 5;

    for (let i = 0; i < numRibbons; i++) {
      const points: { x: number; y: number; vx: number; vy: number }[] = [];
      const numPoints = 80;
      const baseY = canvas.height * (0.2 + i * 0.12);

      for (let j = 0; j < numPoints; j++) {
        points.push({
          x: (j / numPoints) * canvas.width * 1.2 - canvas.width * 0.1,
          y: baseY,
          vx: 0,
          vy: 0,
        });
      }

      ribbons.push({
        points,
        hue: 260 + i * 30, // Purple to pink range
        hueSpeed: 0.1 + Math.random() * 0.1,
        width: 150 + i * 30,
        alpha: isDark ? 0.4 - i * 0.05 : 0.25 - i * 0.03,
      });
    }

    // Magical particles
    interface Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      hue: number;
      alpha: number;
      pulse: number;
    }

    const particles: Particle[] = Array.from({ length: 100 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.7,
      size: Math.random() * 3 + 1,
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: (Math.random() - 0.5) * 0.3 - 0.2,
      hue: 260 + Math.random() * 60,
      alpha: Math.random() * 0.8 + 0.2,
      pulse: Math.random() * Math.PI * 2,
    }));

    let animationId: number;
    let time = 0;

    const animate = () => {
      // Ethereal fade
      ctx.fillStyle = isDark 
        ? 'rgba(8, 8, 20, 0.03)' 
        : 'rgba(248, 248, 255, 0.03)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update and draw ribbons
      ribbons.forEach((ribbon, ri) => {
        ribbon.hue += ribbon.hueSpeed;
        if (ribbon.hue > 320) ribbon.hue = 260;

        // Update ribbon physics
        ribbon.points.forEach((point, i) => {
          const waveOffset = time * 0.02 + i * 0.1 + ri * 0.5;
          const targetY = ribbon.points[0].y + 
            Math.sin(waveOffset) * 40 +
            Math.sin(waveOffset * 0.5) * 60 +
            Math.sin(waveOffset * 0.3 + ri) * 30;
          
          point.vy += (targetY - point.y) * 0.02;
          point.vy *= 0.95;
          point.y += point.vy;
        });

        // Draw ribbon with gradient
        ctx.beginPath();
        ctx.moveTo(ribbon.points[0].x, canvas.height);

        for (let i = 0; i < ribbon.points.length; i++) {
          const p = ribbon.points[i];
          if (i === 0) {
            ctx.lineTo(p.x, p.y);
          } else {
            const prev = ribbon.points[i - 1];
            const cpX = (prev.x + p.x) / 2;
            const cpY = (prev.y + p.y) / 2;
            ctx.quadraticCurveTo(prev.x, prev.y, cpX, cpY);
          }
        }

        ctx.lineTo(ribbon.points[ribbon.points.length - 1].x, canvas.height);
        ctx.closePath();

        // Mystical gradient
        const gradient = ctx.createLinearGradient(0, ribbon.points[0].y - ribbon.width, 0, canvas.height);
        const alpha = ribbon.alpha * (isDark ? 1 : 0.7);
        gradient.addColorStop(0, `hsla(${ribbon.hue}, 80%, 60%, ${alpha})`);
        gradient.addColorStop(0.3, `hsla(${ribbon.hue + 20}, 70%, 50%, ${alpha * 0.6})`);
        gradient.addColorStop(0.6, `hsla(${ribbon.hue + 40}, 60%, 40%, ${alpha * 0.3})`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.fill();

        // Glowing edge
        ctx.beginPath();
        for (let i = 0; i < ribbon.points.length; i++) {
          const p = ribbon.points[i];
          if (i === 0) {
            ctx.moveTo(p.x, p.y);
          } else {
            const prev = ribbon.points[i - 1];
            const cpX = (prev.x + p.x) / 2;
            const cpY = (prev.y + p.y) / 2;
            ctx.quadraticCurveTo(prev.x, prev.y, cpX, cpY);
          }
        }

        ctx.strokeStyle = `hsla(${ribbon.hue}, 100%, 70%, ${alpha * 1.5})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = `hsla(${ribbon.hue}, 100%, 70%, 1)`;
        ctx.shadowBlur = 30;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // Draw magical particles
      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.pulse += 0.05;
        p.hue += 0.2;

        // Wrap around
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height * 0.7;
        if (p.y > canvas.height * 0.7) p.y = 0;

        const pulseAlpha = p.alpha * (0.5 + Math.sin(p.pulse) * 0.5);
        const pulseSize = p.size * (0.8 + Math.sin(p.pulse) * 0.4);

        // Particle glow
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulseSize * 4);
        glow.addColorStop(0, `hsla(${p.hue}, 100%, 80%, ${pulseAlpha})`);
        glow.addColorStop(0.5, `hsla(${p.hue}, 100%, 60%, ${pulseAlpha * 0.3})`);
        glow.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseSize * 4, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 90%, ${pulseAlpha})`;
        ctx.fill();
      });

      // Add shooting stars occasionally
      if (Math.random() < 0.01) {
        const startX = Math.random() * canvas.width;
        const startY = Math.random() * canvas.height * 0.4;
        const length = 100 + Math.random() * 100;
        const angle = Math.PI / 4 + Math.random() * 0.2;

        const gradient = ctx.createLinearGradient(
          startX, startY,
          startX + Math.cos(angle) * length,
          startY + Math.sin(angle) * length
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

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
