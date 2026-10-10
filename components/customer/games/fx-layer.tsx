'use client';

import { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';
import { isReducedMotion } from '@/lib/motion/policy';

/**
 * Tüm mini oyunların paylaştığı parçacık / efekt katmanı. Oyun alanının üstüne
 * mutlak konumlu bir canvas serer; oyun istediği noktada patlama (burst), konfeti
 * ya da yüzen yazı (floatText) tetikler.
 *
 * Motor ilkeleri (lib/games/engine, oyun-ekosistemi Y4):
 *  - Kare hızından BAĞIMSIZ: parçacık ömrü ve hareketi geçen süreyle (dt) ilerler; 120/144 Hz
 *    ekranda efektler 2× hızlı oynamaz. Değerler 60 Hz "kare" birimine normalize edilir.
 *  - Boştayken döngü YOK: parçacık kalmayınca rAF durur, yeni efektle yeniden başlar.
 *  - Görünmezken durur: sekme gizliyken kare çizilmez (rAF zaten durur; dönüşte dt kırpılır).
 *  - Azaltılmış hareket: TEK politika (`lib/motion/policy → isReducedMotion`: OS VEYA
 *    `html.reduce-animations`) — efektler hiç üretilmez.
 *  - DPR + yerleşim boyutu (`clientWidth/clientHeight`; ölçekli ebeveyn tuzağı).
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
  /** Kalan ömür (60 Hz kare birimi). */
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

/** Tek karede hesaba katılan en uzun süre (kare birimi) — sekme dönüşünde sıçrama yok. */
const MAX_FRAME_UNITS = 3;
/** Aynı anda en fazla parçacık (düşük donanım bütçesi). */
const MAX_PARTICLES = 600;

export const FxLayer = forwardRef<FxHandle, { className?: string }>(function FxLayer(
  { className },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const partsRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    sizeRef.current = { w, h, dpr };
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
  }, []);

  const frame = useCallback((t: number) => {
    rafRef.current = null;
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return;
    const last = lastRef.current ?? t;
    lastRef.current = t;
    // 60 Hz kare birimi; sekme dönüşünde kırpılır.
    const k = Math.min(MAX_FRAME_UNITS, Math.max(0, (t - last) / (1000 / 60)));

    const { dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const parts = partsRef.current;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= k;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      const tl = p.life / p.maxLife;
      if (p.kind === 'spark') {
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.vy += 0.12 * k; // yerçekimi
        p.vx *= Math.pow(0.98, k);
        ctx.globalAlpha = tl;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0, p.size * tl), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'ring') {
        const r = (1 - tl) * p.size;
        ctx.globalAlpha = tl * 0.8;
        ctx.strokeStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 16;
        ctx.lineWidth = 3 * tl + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'text' && p.text) {
        p.y += p.vy * k;
        p.vy *= Math.pow(0.96, k);
        ctx.globalAlpha = tl;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 14;
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.kind === 'shock') {
        const e = 1 - tl; // genişleme oranı
        const r = e * p.size;
        ctx.globalAlpha = tl * tl * 0.7;
        ctx.strokeStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 24;
        ctx.lineWidth = 6 * tl + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'confetti') {
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.vy += 0.18 * k; // yerçekimi
        p.vx *= Math.pow(0.99, k);
        p.rot = (p.rot ?? 0) + (p.vr ?? 0) * k;
        ctx.globalAlpha = tl;
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

    if (parts.length > 0) {
      rafRef.current = requestAnimationFrame(frame);
    } else {
      lastRef.current = null; // boşta: döngü durur
    }
  }, []);

  /** Parçacık eklendikten sonra döngüyü (gerekirse) uyandırır. */
  const wake = useCallback(() => {
    if (rafRef.current !== null || !ctxRef.current) return;
    lastRef.current = null;
    rafRef.current = requestAnimationFrame(frame);
  }, [frame]);

  useEffect(() => {
    resize();
    ctxRef.current = canvasRef.current?.getContext('2d') ?? null;
    const ro = new ResizeObserver(resize);
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ro.disconnect();
      partsRef.current = [];
    };
  }, [resize]);

  useImperativeHandle(
    ref,
    (): FxHandle => {
      const push = (items: Particle[]) => {
        if (isReducedMotion()) return;
        const parts = partsRef.current;
        for (const it of items) {
          if (parts.length >= MAX_PARTICLES) parts.shift();
          parts.push(it);
        }
        wake();
      };
      return {
        burst(x, y, color, count = 22) {
          const items: Particle[] = [];
          for (let i = 0; i < count; i++) {
            const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
            const sp = 2 + Math.random() * 4.5;
            items.push({
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
          push(items);
        },
        ring(x, y, color) {
          push([{ x, y, vx: 0, vy: 0, life: 26, maxLife: 26, size: 70, color, kind: 'ring' }]);
        },
        floatText(x, y, text, color) {
          push([{ x, y, vx: 0, vy: -1.6, life: 50, maxLife: 50, size: 0, color, kind: 'text', text }]);
        },
        shockwave(x, y, color, radius = 150) {
          push([{ x, y, vx: 0, vy: 0, life: 34, maxLife: 34, size: radius, color, kind: 'shock' }]);
        },
        confettiAt(x, y, colors = ['#fbbf24', '#22d3ee', '#a855f7', '#34d399', '#f43f5e'], count = 28) {
          const items: Particle[] = [];
          for (let i = 0; i < count; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
            const sp = 3 + Math.random() * 6;
            items.push({
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
          push(items);
        },
      };
    },
    [wake]
  );

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-30 ${className ?? ''}`}
    />
  );
});
