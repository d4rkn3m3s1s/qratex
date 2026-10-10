'use client';

/**
 * Slayt açılışında sayı 0'dan hedefe sayar (≤ `celebrate` 1,2 sn, atlanabilir: slayt
 * değişince bileşen söner). Ekran okuyucu yalnız SON değeri okur; azaltılmış harekette
 * doğrudan son değer çizilir.
 */
import { useEffect, useRef, useState } from 'react';
import { DURATION_MS, EASE, cubicBezier, useReducedMotionPref } from '@/lib/motion';

const ease = cubicBezier(...EASE.emphasized);

export function CountUp({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const reduce = useReducedMotionPref();
  const [shown, setShown] = useState(reduce ? value : 0);
  const raf = useRef(0);

  useEffect(() => {
    if (reduce || value <= 0) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION_MS.celebrate);
      setShown(Math.round(value * ease(p)));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, reduce]);

  return (
    <span className={className}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
