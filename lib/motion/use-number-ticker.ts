'use client';

import { useEffect, useRef, useState } from 'react';
import { numberTicker } from './variants';
import { useReducedMotionPref } from './use-reduced-motion-pref';

/** cubic-bezier(x1,y1,x2,y2) zamanlama fonksiyonu (Newton–Raphson). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-5) break;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sampleY(Math.min(1, Math.max(0, t)));
  };
}

const easeEmphasized = cubicBezier(...numberTicker.ease);

/**
 * Sayıyı önceki değerinden yenisine yumuşakça sayar (rAF; framer paketi gerekmez).
 * Azaltılmış harekette ve ilk boyamada doğrudan hedef değeri döner (sayfa
 * açılışında 0'dan saymak "sahte yükleniyor" hissi verir; yalnız DEĞİŞİM anlatılır).
 */
export function useNumberTicker(
  value: number,
  { durationMs = numberTicker.durationMs, animateOnMount = false }: { durationMs?: number; animateOnMount?: boolean } = {},
): number {
  const reduce = useReducedMotionPref();
  const [display, setDisplay] = useState<number>(animateOnMount ? 0 : value);
  const fromRef = useRef<number>(animateOnMount ? 0 : value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(value)) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    if (reduce || from === value || typeof requestAnimationFrame !== 'function') {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const next = from + (value - from) * easeEmphasized(p);
      fromRef.current = next;
      setDisplay(next);
      if (p < 1) frameRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, reduce, durationMs]);

  return display;
}
