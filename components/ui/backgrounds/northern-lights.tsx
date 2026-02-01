'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface NorthernLightsBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function NorthernLightsBackground({ children, className }: NorthernLightsBackgroundProps) {
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

    // Aurora bands - horizontal flowing light
    interface AuroraBand {
      baseY: number;
      thickness: number;
      hue: number;
      hueSpeed: number;
      speed: number;
      phase: number;
      amplitude: number;
      frequency: number;
      opacity: number;
    }

    const bands: AuroraBand[] = [
      { baseY: 0.25, thickness: 120, hue: 140, hueSpeed: 0.3, speed: 0.008, phase: 0, amplitude: 40, frequency: 0.003, opacity: 0.5 },
      { baseY: 0.32, thickness: 100, hue: 160, hueSpeed: 0.25, speed: 0.01, phase: 1, amplitude: 50, frequency: 0.004, opacity: 0.45 },
      { baseY: 0.28, thickness: 80, hue: 180, hueSpeed: 0.35, speed: 0.012, phase: 2, amplitude: 35, frequency: 0.005, opacity: 0.4 },
      { baseY: 0.35, thickness: 150, hue: 120, hueSpeed: 0.2, speed: 0.006, phase: 3, amplitude: 60, frequency: 0.002, opacity: 0.35 },
      { baseY: 0.22, thickness: 70, hue: 200, hueSpeed: 0.4, speed: 0.015, phase: 4, amplitude: 30, frequency: 0.006, opacity: 0.3 },
      { baseY: 0.4, thickness: 90, hue: 280, hueSpeed: 0.15, speed: 0.007, phase: 5, amplitude: 45, frequency: 0.0035, opacity: 0.25 },
    ];

    // Stars
    interface Star {
      x: number;
      y: number;
      size: number;
      brightness: number;
      twinkle: number;
    }

    const stars: Star[] = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.5 + 0.5,
      brightness: Math.random(),
      twinkle: Math.random() * Math.PI * 2,
    }));

    // Floating light particles
    interface LightParticle {
      x: number;
      y: number;
      size: number;
      hue: number;
      speedX: number;
      speedY: number;
      alpha: number;
      pulse: number;
    }

    const particles: LightParticle[] = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.6,
      size: 2 + Math.random() * 4,
      hue: 120 + Math.random() * 80,
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: (Math.random() - 0.5) * 0.3,
      alpha: 0.3 + Math.random() * 0.5,
      pulse: Math.random() * Math.PI * 2,
    }));

    let animationId: number;
    let time = 0;

    const animate = () => {
      // Dark sky background with fade
      ctx.fillStyle = isDark ? 'rgba(5, 8, 20, 0.06)' : 'rgba(230, 240, 250, 0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw stars
      stars.forEach((star) => {
        star.twinkle += 0.02;
        const alpha = star.brightness * (0.4 + Math.sin(star.twinkle) * 0.6) * (isDark ? 0.8 : 0.4);
        
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      });

      // Draw aurora bands
      bands.forEach((band) => {
        band.phase += band.speed;
        band.hue += band.hueSpeed;
        if (band.hue > 300) band.hue = 100;

        // Create flowing wave path
        ctx.beginPath();
        
        const points: { x: number; y: number }[] = [];
        
        for (let x = -50; x <= canvas.width + 50; x += 8) {
          const baseY = canvas.height * band.baseY;
          const wave1 = Math.sin(x * band.frequency + band.phase) * band.amplitude;
          const wave2 = Math.sin(x * band.frequency * 2 + band.phase * 1.5) * (band.amplitude * 0.4);
          const wave3 = Math.sin(x * band.frequency * 0.5 + band.phase * 0.7) * (band.amplitude * 0.6);
          const y = baseY + wave1 + wave2 + wave3;
          points.push({ x, y });
        }

        // Draw top edge
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const cpX = (prev.x + curr.x) / 2;
          const cpY = (prev.y + curr.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, cpX, cpY);
        }

        // Draw bottom edge (with thickness)
        for (let i = points.length - 1; i >= 0; i--) {
          const p = points[i];
          const bottomY = p.y + band.thickness + Math.sin(p.x * 0.01 + band.phase * 2) * 20;
          if (i === points.length - 1) {
            ctx.lineTo(p.x, bottomY);
          } else {
            const next = points[i + 1];
            const nextBottomY = next.y + band.thickness + Math.sin(next.x * 0.01 + band.phase * 2) * 20;
            const cpX = (p.x + next.x) / 2;
            const cpY = (bottomY + nextBottomY) / 2;
            ctx.quadraticCurveTo(next.x, nextBottomY, cpX, cpY);
          }
        }

        ctx.closePath();

        // Gradient fill - vertical fade
        const gradient = ctx.createLinearGradient(
          0, canvas.height * band.baseY - band.amplitude,
          0, canvas.height * band.baseY + band.thickness + band.amplitude
        );
        
        const alpha = band.opacity * (isDark ? 1 : 0.6);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.2, `hsla(${band.hue}, 70%, 50%, ${alpha * 0.3})`);
        gradient.addColorStop(0.4, `hsla(${band.hue + 20}, 80%, 55%, ${alpha * 0.8})`);
        gradient.addColorStop(0.5, `hsla(${band.hue + 30}, 90%, 60%, ${alpha})`);
        gradient.addColorStop(0.6, `hsla(${band.hue + 20}, 80%, 55%, ${alpha * 0.8})`);
        gradient.addColorStop(0.8, `hsla(${band.hue}, 70%, 50%, ${alpha * 0.3})`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.fill();

        // Bright center line glow
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const centerY = p.y + band.thickness / 2;
          if (i === 0) {
            ctx.moveTo(p.x, centerY);
          } else {
            const prev = points[i - 1];
            const prevCenterY = prev.y + band.thickness / 2;
            const cpX = (prev.x + p.x) / 2;
            const cpY = (prevCenterY + centerY) / 2;
            ctx.quadraticCurveTo(prev.x, prevCenterY, cpX, cpY);
          }
        }
        
        ctx.strokeStyle = `hsla(${band.hue + 30}, 100%, 70%, ${alpha * 0.6})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = `hsla(${band.hue + 30}, 100%, 70%, 1)`;
        ctx.shadowBlur = 20;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // Draw floating particles
      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.pulse += 0.03;
        p.hue += 0.2;

        // Wrap around
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height * 0.6;
        if (p.y > canvas.height * 0.6) p.y = 0;

        const pulseAlpha = p.alpha * (0.5 + Math.sin(p.pulse) * 0.5);
        const pulseSize = p.size * (0.8 + Math.sin(p.pulse) * 0.3);

        // Particle glow
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulseSize * 3);
        glow.addColorStop(0, `hsla(${p.hue}, 80%, 70%, ${pulseAlpha})`);
        glow.addColorStop(0.5, `hsla(${p.hue}, 80%, 60%, ${pulseAlpha * 0.3})`);
        glow.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseSize * 3, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      });

      // Ground reflection glow
      const groundGlow = ctx.createLinearGradient(0, canvas.height * 0.7, 0, canvas.height);
      groundGlow.addColorStop(0, 'transparent');
      groundGlow.addColorStop(0.5, isDark ? 'rgba(100, 180, 140, 0.05)' : 'rgba(100, 180, 140, 0.02)');
      groundGlow.addColorStop(1, isDark ? 'rgba(80, 160, 200, 0.08)' : 'rgba(80, 160, 200, 0.03)');
      
      ctx.fillStyle = groundGlow;
      ctx.fillRect(0, canvas.height * 0.7, canvas.width, canvas.height * 0.3);

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
