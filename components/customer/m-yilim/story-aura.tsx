'use client';

/**
 * Hikâye zemini: ÖLÇÜLÜ 2D canvas aura (üç yumuşak ışık lekesi). Three.js YOK (§4.2 3D
 * politikası: Yılım'da 3B gerekmiyor).
 *
 * Bütçe ve kurallar:
 *  - Yarı çözünürlükte çizilir (bulanık içerik; CSS ölçekler), en fazla ~30 fps.
 *  - Sekme gizliyken / bileşen ekranda değilken döngü durur (`document.hidden`).
 *  - Azaltılmış harekette TEK statik kare çizilir, döngü hiç başlamaz.
 *  - Boyut ResizeObserver + clientWidth/clientHeight ile (ölçekli ebeveynde doğru ölçü).
 *  - Slayt değişince renkler yumuşakça geçer (lerp), konum zıplamaz.
 */
import { useEffect, useRef } from 'react';
import { useReducedMotionPref } from '@/lib/motion';
import { categoryColor, hsla, readHslToken, type Hsl } from './color-tokens';

type Props = {
  /** `--category-*` indeksleri (vurgu çifti). */
  accent: [number, number];
  className?: string;
};

const RENDER_SCALE = 0.5;
const FRAME_MS = 1000 / 30;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function lerpHue(a: number, b: number, t: number) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}
function mix(a: Hsl, b: Hsl, t: number): Hsl {
  return { h: lerpHue(a.h, b.h, t), s: lerp(a.s, b.s, t), l: lerp(a.l, b.l, t) };
}

export function StoryAura({ accent, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotionPref();
  const target = useRef<{ a: Hsl; b: Hsl; base: Hsl } | null>(null);
  const current = useRef<{ a: Hsl; b: Hsl; base: Hsl } | null>(null);
  const redrawStatic = useRef<(() => void) | null>(null);

  // Hedef renkler (slayt değişince).
  useEffect(() => {
    target.current = { a: categoryColor(accent[0]), b: categoryColor(accent[1]), base: readHslToken('brand') };
    if (!current.current) current.current = target.current;
    if (reduce) {
      current.current = target.current;
      redrawStatic.current?.();
    }
  }, [accent, reduce]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      w = Math.max(1, Math.round(canvas.clientWidth * RENDER_SCALE));
      h = Math.max(1, Math.round(canvas.clientHeight * RENDER_SCALE));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    };

    const draw = (time: number) => {
      const col = current.current;
      if (!col) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = hsla(col.base, 1, 7);
      ctx.fillRect(0, 0, w, h);
      const t = time / 1000;
      const spots: Array<[number, number, number, Hsl, number]> = [
        [0.25 + Math.sin(t * 0.21) * 0.12, 0.22 + Math.cos(t * 0.17) * 0.08, 0.75, col.a, 0.55],
        [0.78 + Math.cos(t * 0.19) * 0.1, 0.58 + Math.sin(t * 0.23) * 0.1, 0.8, col.b, 0.45],
        [0.4 + Math.sin(t * 0.13 + 1.3) * 0.14, 0.95 + Math.cos(t * 0.11) * 0.05, 0.7, col.base, 0.4],
      ];
      ctx.globalCompositeOperation = 'lighter';
      const r0 = Math.max(w, h);
      for (const [x, y, r, c, alpha] of spots) {
        const cx = x * w;
        const cy = y * h;
        const rr = r * r0;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, hsla(c, alpha, 48));
        g.addColorStop(1, hsla(c, 0, 48));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { resize(); if (reduce) draw(0); }) : null;
    ro?.observe(canvas);

    redrawStatic.current = () => draw(0);
    if (reduce) {
      draw(0);
      return () => {
        ro?.disconnect();
        redrawStatic.current = null;
      };
    }

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || now - last < FRAME_MS) return;
      last = now;
      const cur = current.current;
      const tgt = target.current;
      if (cur && tgt) {
        current.current = { a: mix(cur.a, tgt.a, 0.06), b: mix(cur.b, tgt.b, 0.06), base: mix(cur.base, tgt.base, 0.06) };
      }
      draw(now);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      redrawStatic.current = null;
    };
  }, [reduce]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
