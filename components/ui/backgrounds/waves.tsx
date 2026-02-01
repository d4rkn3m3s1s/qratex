'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface WavesBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function WavesBackground({ children, className }: WavesBackgroundProps) {
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

    // Ethereal wave layers
    interface WaveLayer {
      baseY: number;
      amplitude: number;
      frequency: number;
      speed: number;
      phase: number;
      color: { h: number; s: number; l: number };
      secondaryWaves: { amp: number; freq: number; speed: number }[];
    }

    const waveLayers: WaveLayer[] = [
      {
        baseY: 0.85,
        amplitude: 50,
        frequency: 0.008,
        speed: 0.015,
        phase: 0,
        color: { h: 220, s: 80, l: 50 },
        secondaryWaves: [
          { amp: 20, freq: 0.015, speed: 0.02 },
          { amp: 10, freq: 0.025, speed: 0.03 },
        ],
      },
      {
        baseY: 0.75,
        amplitude: 60,
        frequency: 0.006,
        speed: 0.012,
        phase: Math.PI / 3,
        color: { h: 260, s: 70, l: 55 },
        secondaryWaves: [
          { amp: 25, freq: 0.012, speed: 0.018 },
          { amp: 15, freq: 0.02, speed: 0.025 },
        ],
      },
      {
        baseY: 0.65,
        amplitude: 45,
        frequency: 0.01,
        speed: 0.018,
        phase: Math.PI / 2,
        color: { h: 300, s: 65, l: 50 },
        secondaryWaves: [
          { amp: 18, freq: 0.018, speed: 0.022 },
          { amp: 12, freq: 0.028, speed: 0.035 },
        ],
      },
      {
        baseY: 0.55,
        amplitude: 35,
        frequency: 0.007,
        speed: 0.01,
        phase: Math.PI,
        color: { h: 180, s: 75, l: 45 },
        secondaryWaves: [
          { amp: 15, freq: 0.014, speed: 0.016 },
          { amp: 8, freq: 0.022, speed: 0.028 },
        ],
      },
    ];

    // Floating orbs
    interface Orb {
      x: number;
      y: number;
      radius: number;
      hue: number;
      speedX: number;
      speedY: number;
      pulse: number;
    }

    const orbs: Orb[] = Array.from({ length: 15 }, () => ({
      x: Math.random() * canvas.width,
      y: canvas.height * 0.5 + Math.random() * canvas.height * 0.5,
      radius: 20 + Math.random() * 60,
      hue: 180 + Math.random() * 140,
      speedX: (Math.random() - 0.5) * 0.8,
      speedY: (Math.random() - 0.5) * 0.4,
      pulse: Math.random() * Math.PI * 2,
    }));

    // Bubble particles
    interface Bubble {
      x: number;
      y: number;
      radius: number;
      speed: number;
      wobble: number;
      wobbleSpeed: number;
    }

    const bubbles: Bubble[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.width,
      y: canvas.height + Math.random() * 100,
      radius: 2 + Math.random() * 6,
      speed: 0.5 + Math.random() * 1.5,
      wobble: 0,
      wobbleSpeed: 0.02 + Math.random() * 0.03,
    }));

    let animationId: number;
    let time = 0;

    const animate = () => {
      // Clear with depth gradient
      const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      if (isDark) {
        bgGradient.addColorStop(0, 'rgba(5, 10, 30, 0.1)');
        bgGradient.addColorStop(1, 'rgba(10, 20, 40, 0.1)');
      } else {
        bgGradient.addColorStop(0, 'rgba(240, 248, 255, 0.1)');
        bgGradient.addColorStop(1, 'rgba(230, 240, 250, 0.1)');
      }
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw orbs (behind waves)
      orbs.forEach((orb) => {
        orb.x += orb.speedX;
        orb.y += orb.speedY;
        orb.pulse += 0.02;
        orb.hue += 0.1;

        // Bounce off edges
        if (orb.x < -orb.radius) orb.x = canvas.width + orb.radius;
        if (orb.x > canvas.width + orb.radius) orb.x = -orb.radius;
        if (orb.y < canvas.height * 0.4) orb.speedY *= -1;
        if (orb.y > canvas.height) orb.speedY *= -1;

        const pulseRadius = orb.radius * (1 + Math.sin(orb.pulse) * 0.2);
        const alpha = isDark ? 0.15 : 0.1;

        const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, pulseRadius);
        gradient.addColorStop(0, `hsla(${orb.hue}, 70%, 60%, ${alpha})`);
        gradient.addColorStop(0.5, `hsla(${orb.hue + 20}, 60%, 50%, ${alpha * 0.5})`);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(orb.x, orb.y, pulseRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      // Draw wave layers (back to front)
      waveLayers.forEach((layer, layerIndex) => {
        layer.phase += layer.speed;

        const points: { x: number; y: number }[] = [];

        // Calculate wave points
        for (let x = -10; x <= canvas.width + 10; x += 3) {
          let y = canvas.height * layer.baseY;
          
          // Main wave
          y += Math.sin(x * layer.frequency + layer.phase) * layer.amplitude;
          
          // Secondary waves for complexity
          layer.secondaryWaves.forEach((sw, i) => {
            y += Math.sin(x * sw.freq + layer.phase * sw.speed * 50 + i) * sw.amp;
          });

          points.push({ x, y });
        }

        // Draw wave fill
        ctx.beginPath();
        ctx.moveTo(points[0].x, canvas.height);
        
        for (let i = 0; i < points.length; i++) {
          if (i === 0) {
            ctx.lineTo(points[i].x, points[i].y);
          } else {
            // Smooth curve
            const xc = (points[i - 1].x + points[i].x) / 2;
            const yc = (points[i - 1].y + points[i].y) / 2;
            ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
          }
        }
        
        ctx.lineTo(canvas.width + 10, canvas.height);
        ctx.closePath();

        // Gradient fill
        const fillGradient = ctx.createLinearGradient(0, points[0].y - layer.amplitude, 0, canvas.height);
        const baseAlpha = isDark ? 0.35 - layerIndex * 0.05 : 0.25 - layerIndex * 0.04;
        fillGradient.addColorStop(0, `hsla(${layer.color.h}, ${layer.color.s}%, ${layer.color.l}%, ${baseAlpha})`);
        fillGradient.addColorStop(0.4, `hsla(${layer.color.h + 10}, ${layer.color.s - 10}%, ${layer.color.l - 10}%, ${baseAlpha * 0.6})`);
        fillGradient.addColorStop(1, `hsla(${layer.color.h + 20}, ${layer.color.s - 20}%, ${layer.color.l - 20}%, ${baseAlpha * 0.2})`);

        ctx.fillStyle = fillGradient;
        ctx.fill();

        // Glowing crest
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
          if (i === 0) {
            ctx.moveTo(points[i].x, points[i].y);
          } else {
            const xc = (points[i - 1].x + points[i].x) / 2;
            const yc = (points[i - 1].y + points[i].y) / 2;
            ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
          }
        }

        ctx.strokeStyle = `hsla(${layer.color.h}, 100%, 75%, ${baseAlpha * 1.5})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = `hsla(${layer.color.h}, 100%, 70%, 0.8)`;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Foam/sparkle on crests
        if (layerIndex === 0) {
          for (let i = 0; i < points.length; i += 20) {
            if (Math.random() < 0.3) {
              const p = points[i];
              ctx.beginPath();
              ctx.arc(p.x, p.y - 5, 2 + Math.random() * 3, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + Math.random() * 0.4})`;
              ctx.fill();
            }
          }
        }
      });

      // Draw bubbles
      bubbles.forEach((bubble) => {
        bubble.y -= bubble.speed;
        bubble.wobble += bubble.wobbleSpeed;
        bubble.x += Math.sin(bubble.wobble) * 0.5;

        if (bubble.y < -bubble.radius) {
          bubble.y = canvas.height + bubble.radius;
          bubble.x = Math.random() * canvas.width;
        }

        // Bubble with reflection
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${isDark ? 0.3 : 0.2})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Highlight
        ctx.beginPath();
        ctx.arc(bubble.x - bubble.radius * 0.3, bubble.y - bubble.radius * 0.3, bubble.radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${isDark ? 0.4 : 0.3})`;
        ctx.fill();
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
