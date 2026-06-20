'use client';

import { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';

/**
 * Tüm mini oyunların paylaştığı particle / efekt katmanı. Oyun alanının üstüne
 * mutlak konumlu bir canvas serer; oyun istediği noktada patlama (burst), konfeti
 * ya da yüzen yazı (floatText) tetikler. 60fps requestAnimationFrame döngüsü,
 * "reduce-animations" tercihinde efektler kapanır.
 *
 * Kullanım:
 *   const fx = useRef<FxHandle>(null);
 *   <FxLayer ref={fx} />
 *   fx.current?.burst(x, y, '#a855f7', 24);
 *   fx.current?.floatText(x, y, '+1', '#34d399');
 */
export interface FxHandle {
  burst: (x: number, y: number, color: string, count?: number) => void;
  ring: (x: number, y: number, color: string) => void;
  floatText: (x: number, y: number, text: string, color: string) => void;
  /** Büyük, yavaş genişleyen şok dalgası (boss/milestone vurguları). */
  shockwave: (x: number, y: number, color: string, radius?: number) => void;
  /** Yerel konfeti püskürtmesi (kazanma/kombo). */
  confettiAt: (x: number, y: number, colors?: string[], count?: number) => void;
}

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'spark' | 'ring' | 'text' | 'shock' | 'confetti';
  text?: string;
  rot?: number;
  vr?: number;
  w?: number;
  h?: number;
};

function reduced(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('reduce-animations');
}

export const FxLayer = forwardRef<FxHandle, { className?: string }>(function FxLayer(
  { className },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const partsRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    sizeRef.current = { w, h, dpr };
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
  }, []);

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(resize);
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);

    const ctx = canvasRef.current?.getContext('2d') ?? null;
    const loop = () => {
      const c = canvasRef.current;
      if (ctx && c) {
        const { dpr } = sizeRef.current;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        const parts = partsRef.current;
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.life -= 1;
          if (p.life <= 0) {
            parts.splice(i, 1);
            continue;
          }
          const t = p.life / p.maxLife;
          if (p.kind === 'spark') {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.12; // yerçekimi
            p.vx *= 0.98;
            ctx.globalAlpha = t;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.kind === 'ring') {
            const r = (1 - t) * p.size;
            ctx.globalAlpha = t * 0.8;
            ctx.strokeStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 16;
            ctx.lineWidth = 3 * t + 0.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.stroke();
          } else if (p.kind === 'text' && p.text) {
            p.y += p.vy;
            p.vy *= 0.96;
            ctx.globalAlpha = t;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 14;
            ctx.font = 'bold 22px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x, p.y);
          } else if (p.kind === 'shock') {
            const e = 1 - t; // genişleme oranı
            const r = e * p.size;
            ctx.globalAlpha = t * t * 0.7;
            ctx.strokeStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 24;
            ctx.lineWidth = 6 * t + 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.stroke();
          } else if (p.kind === 'confetti') {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.18; // yerçekimi
            p.vx *= 0.99;
            p.rot = (p.rot ?? 0) + (p.vr ?? 0);
            ctx.globalAlpha = t;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 6;
            ctx.fillRect(-(p.w ?? 4) / 2, -(p.h ?? 7) / 2, p.w ?? 4, p.h ?? 7);
            ctx.restore();
          }
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [resize]);

  useImperativeHandle(
    ref,
    (): FxHandle => ({
      burst(x, y, color, count = 22) {
        if (reduced()) return;
        for (let i = 0; i < count; i++) {
          const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
          const sp = 2 + Math.random() * 4.5;
          partsRef.current.push({
            x,
            y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 1,
            life: 32 + Math.random() * 14,
            maxLife: 46,
            size: 2 + Math.random() * 3,
            color,
            kind: 'spark',
          });
        }
      },
      ring(x, y, color) {
        if (reduced()) return;
        partsRef.current.push({
          x,
          y,
          vx: 0,
          vy: 0,
          life: 26,
          maxLife: 26,
          size: 70,
          color,
          kind: 'ring',
        });
      },
      floatText(x, y, text, color) {
        if (reduced()) return;
        partsRef.current.push({
          x,
          y,
          vx: 0,
          vy: -1.6,
          life: 50,
          maxLife: 50,
          size: 0,
          color,
          kind: 'text',
          text,
        });
      },
      shockwave(x, y, color, radius = 150) {
        if (reduced()) return;
        partsRef.current.push({
          x,
          y,
          vx: 0,
          vy: 0,
          life: 34,
          maxLife: 34,
          size: radius,
          color,
          kind: 'shock',
        });
      },
      confettiAt(x, y, colors = ['#fbbf24', '#22d3ee', '#a855f7', '#34d399', '#f43f5e'], count = 28) {
        if (reduced()) return;
        for (let i = 0; i < count; i++) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
          const sp = 3 + Math.random() * 6;
          partsRef.current.push({
            x,
            y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 50 + Math.random() * 30,
            maxLife: 80,
            size: 0,
            color: colors[Math.floor(Math.random() * colors.length)],
            kind: 'confetti',
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.4,
            w: 4 + Math.random() * 3,
            h: 7 + Math.random() * 4,
          });
        }
      },
    }),
    []
  );

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 z-30 ${className ?? ''}`}
    />
  );
});
