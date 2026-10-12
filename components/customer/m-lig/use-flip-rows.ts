'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * FLIP: sıralama değişince (aynı liste anahtarı içinde) satırlar eski yerinden yenisine kayar.
 * `layout` prop'u global LazyMotion(domAnimation) ile çalışmadığından WAAPI ile elle yapılır.
 * Yalnız transform; azaltılmış harekette ve ilk çizimde/anahtar değişiminde çalışmaz.
 */
export function useFlipRows(keys: readonly string[], resetKey: string) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const last = useRef<{ resetKey: string; tops: Map<string, number> } | null>(null);
  const order = keys.join('|');

  useLayoutEffect(() => {
    const tops = new Map<string, number>();
    nodes.current.forEach((el, k) => tops.set(k, el.offsetTop));
    const prev = last.current;
    last.current = { resetKey, tops };
    if (!prev || prev.resetKey !== resetKey) return;
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    nodes.current.forEach((el, k) => {
      const before = prev.tops.get(k);
      const now = tops.get(k);
      if (before == null || now == null || before === now) return;
      el.animate?.([{ transform: `translateY(${before - now}px)` }, { transform: 'translateY(0)' }], {
        duration: 420,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
    });
  }, [order, resetKey]);

  return (key: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(key, el);
    else nodes.current.delete(key);
  };
}
