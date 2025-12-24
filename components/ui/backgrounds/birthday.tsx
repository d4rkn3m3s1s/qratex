'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface Balloon {
  x: number;
  y: number;
  size: number;
  speed: number;
  color: string;
  swing: number;
  swingSpeed: number;
  stringLength: number;
}

interface Confetti {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  speedX: number;
  speedY: number;
  gravity: number;
}

interface BirthdayBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function BirthdayBackground({
  children,
  className,
}: BirthdayBackgroundProps) {
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

    const balloonColors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181', '#aa96da', '#fcbad3', '#a8d8ea'];
    const confettiColors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181', '#aa96da', '#fcbad3', '#ff9f43', '#00d2d3', '#54a0ff'];

    // Balonlar
    const balloons: Balloon[] = Array.from({ length: 15 }, () => ({
      x: Math.random() * canvas.width,
      y: canvas.height + Math.random() * 200,
      size: 30 + Math.random() * 30,
      speed: 0.3 + Math.random() * 0.5,
      color: balloonColors[Math.floor(Math.random() * balloonColors.length)],
      swing: Math.random() * Math.PI * 2,
      swingSpeed: 0.01 + Math.random() * 0.02,
      stringLength: 50 + Math.random() * 30,
    }));

    // Konfeti
    const confettis: Confetti[] = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      width: 5 + Math.random() * 8,
      height: 10 + Math.random() * 15,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      speedX: (Math.random() - 0.5) * 2,
      speedY: 1 + Math.random() * 2,
      gravity: 0.01 + Math.random() * 0.02,
    }));

    const drawBalloon = (balloon: Balloon) => {
      const { x, y, size, color, swing, stringLength } = balloon;
      const swingX = Math.sin(swing) * 10;

      // İp
      ctx.beginPath();
      ctx.moveTo(x + swingX, y + size * 0.9);
      ctx.quadraticCurveTo(
        x + swingX * 0.5,
        y + size + stringLength * 0.5,
        x,
        y + size + stringLength
      );
      ctx.strokeStyle = isDark ? 'rgba(200, 200, 200, 0.5)' : 'rgba(100, 100, 100, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Balon gövdesi
      ctx.beginPath();
      ctx.ellipse(x + swingX, y, size * 0.8, size, 0, 0, Math.PI * 2);
      
      // Gradient
      const gradient = ctx.createRadialGradient(
        x + swingX - size * 0.3,
        y - size * 0.3,
        0,
        x + swingX,
        y,
        size
      );
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.2, color);
      gradient.addColorStop(1, color + '80');
      
      ctx.fillStyle = gradient;
      ctx.fill();

      // Parlama
      ctx.beginPath();
      ctx.ellipse(x + swingX - size * 0.3, y - size * 0.4, size * 0.15, size * 0.25, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fill();

      // Alt düğüm
      ctx.beginPath();
      ctx.moveTo(x + swingX - size * 0.1, y + size * 0.85);
      ctx.lineTo(x + swingX, y + size * 1.05);
      ctx.lineTo(x + swingX + size * 0.1, y + size * 0.85);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    const drawConfetti = (c: Confetti) => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      
      // 3D efekti için perspektif
      const perspective = Math.cos(c.rotation * 2);
      const width = c.width * Math.abs(perspective);
      
      ctx.beginPath();
      ctx.rect(-width / 2, -c.height / 2, width, c.height);
      ctx.fillStyle = c.color;
      ctx.fill();
      
      ctx.restore();
    };

    let animationId: number;
    let time = 0;

    const animate = () => {
      // Arka plan
      const bgColor = isDark 
        ? 'rgba(15, 15, 35, 0.1)' 
        : 'rgba(255, 250, 245, 0.15)';
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Parti ışınları arka planda
      if (time % 3 === 0) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2 + time * 0.002;
          const gradient = ctx.createLinearGradient(
            centerX,
            centerY,
            centerX + Math.cos(angle) * canvas.width,
            centerY + Math.sin(angle) * canvas.height
          );
          
          const rayColor = isDark 
            ? `rgba(${50 + i * 15}, ${100 + i * 10}, ${200 - i * 10}, 0.03)`
            : `rgba(${255 - i * 10}, ${200 + i * 5}, ${100 + i * 10}, 0.02)`;
          
          gradient.addColorStop(0, 'transparent');
          gradient.addColorStop(0.3, rayColor);
          gradient.addColorStop(1, 'transparent');
          
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(
            centerX + Math.cos(angle - 0.05) * canvas.width,
            centerY + Math.sin(angle - 0.05) * canvas.height
          );
          ctx.lineTo(
            centerX + Math.cos(angle + 0.05) * canvas.width,
            centerY + Math.sin(angle + 0.05) * canvas.height
          );
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();
        }
      }

      // Konfetileri çiz ve güncelle
      confettis.forEach((c) => {
        c.y += c.speedY;
        c.x += c.speedX;
        c.speedY += c.gravity;
        c.rotation += c.rotationSpeed;
        c.speedX *= 0.99; // Yavaşla

        // Ekrandan çıkınca yukarıdan tekrar
        if (c.y > canvas.height + 20) {
          c.y = -20;
          c.x = Math.random() * canvas.width;
          c.speedY = 1 + Math.random() * 2;
          c.speedX = (Math.random() - 0.5) * 2;
        }

        drawConfetti(c);
      });

      // Balonları çiz ve güncelle
      balloons.forEach((balloon) => {
        balloon.y -= balloon.speed;
        balloon.swing += balloon.swingSpeed;

        // Yukarı çıkınca aşağıdan tekrar
        if (balloon.y < -balloon.size - balloon.stringLength) {
          balloon.y = canvas.height + balloon.size + balloon.stringLength;
          balloon.x = Math.random() * canvas.width;
        }

        drawBalloon(balloon);
      });

      // Köşelerde kutlama efekti
      const glowColors = isDark
        ? ['rgba(255, 107, 107, 0.1)', 'rgba(78, 205, 196, 0.1)']
        : ['rgba(255, 107, 107, 0.07)', 'rgba(78, 205, 196, 0.07)'];

      // Sol üst
      const g1 = ctx.createRadialGradient(0, 0, 0, 0, 0, 250);
      g1.addColorStop(0, glowColors[0]);
      g1.addColorStop(1, 'transparent');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, 250, 250);

      // Sağ üst
      const g2 = ctx.createRadialGradient(canvas.width, 0, 0, canvas.width, 0, 250);
      g2.addColorStop(0, glowColors[1]);
      g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2;
      ctx.fillRect(canvas.width - 250, 0, 250, 250);

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

