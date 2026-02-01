'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface HolographicBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function HolographicBackground({ children, className }: HolographicBackgroundProps) {
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

    // Rainbow gradient positions
    interface Prism {
      x: number;
      y: number;
      size: number;
      rotation: number;
      rotationSpeed: number;
      hue: number;
      hueSpeed: number;
    }

    const prisms: Prism[] = Array.from({ length: 6 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: 150 + Math.random() * 200,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.01,
      hue: Math.random() * 360,
      hueSpeed: 0.5 + Math.random() * 0.5,
    }));

    // Floating particles
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      hue: number;
    }

    const particles: Particle[] = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: 2 + Math.random() * 4,
      hue: Math.random() * 360,
    }));

    // Light rays
    interface Ray {
      angle: number;
      speed: number;
      width: number;
      hue: number;
    }

    const rays: Ray[] = Array.from({ length: 8 }, (_, i) => ({
      angle: (i / 8) * Math.PI * 2,
      speed: 0.003 + Math.random() * 0.002,
      width: 50 + Math.random() * 100,
      hue: i * 45,
    }));

    let animationId: number;
    let time = 0;

    const animate = () => {
      // Clear with transparency
      ctx.fillStyle = isDark ? 'rgba(10, 10, 15, 0.08)' : 'rgba(250, 250, 255, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Draw holographic rays from center
      rays.forEach((ray) => {
        ray.angle += ray.speed;
        ray.hue = (ray.hue + 0.3) % 360;

        const length = Math.max(canvas.width, canvas.height);
        const endX = centerX + Math.cos(ray.angle) * length;
        const endY = centerY + Math.sin(ray.angle) * length;

        const gradient = ctx.createLinearGradient(centerX, centerY, endX, endY);
        const alpha = isDark ? 0.1 : 0.06;
        gradient.addColorStop(0, `hsla(${ray.hue}, 100%, 70%, ${alpha})`);
        gradient.addColorStop(0.5, `hsla(${(ray.hue + 60) % 360}, 100%, 60%, ${alpha * 0.5})`);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
          centerX + Math.cos(ray.angle - 0.1) * length,
          centerY + Math.sin(ray.angle - 0.1) * length
        );
        ctx.lineTo(
          centerX + Math.cos(ray.angle + 0.1) * length,
          centerY + Math.sin(ray.angle + 0.1) * length
        );
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      // Draw prisms
      prisms.forEach((prism) => {
        prism.rotation += prism.rotationSpeed;
        prism.hue = (prism.hue + prism.hueSpeed) % 360;

        ctx.save();
        ctx.translate(prism.x, prism.y);
        ctx.rotate(prism.rotation);

        // Create rainbow gradient
        const gradient = ctx.createLinearGradient(-prism.size, -prism.size, prism.size, prism.size);
        for (let i = 0; i <= 6; i++) {
          const hue = (prism.hue + i * 60) % 360;
          const alpha = isDark ? 0.15 : 0.1;
          gradient.addColorStop(i / 6, `hsla(${hue}, 100%, 60%, ${alpha})`);
        }

        // Draw diamond shape
        ctx.beginPath();
        ctx.moveTo(0, -prism.size);
        ctx.lineTo(prism.size * 0.6, 0);
        ctx.lineTo(0, prism.size);
        ctx.lineTo(-prism.size * 0.6, 0);
        ctx.closePath();

        ctx.fillStyle = gradient;
        ctx.fill();

        // Glow effect
        ctx.shadowColor = `hsla(${prism.hue}, 100%, 70%, 0.5)`;
        ctx.shadowBlur = 30;
        ctx.strokeStyle = `hsla(${prism.hue}, 100%, 80%, 0.3)`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.restore();
      });

      // Draw particles
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.hue = (p.hue + 1) % 360;

        // Wrap around
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Draw with glow
        const alpha = isDark ? 0.8 : 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
        ctx.shadowColor = `hsla(${p.hue}, 100%, 70%, 1)`;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
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
