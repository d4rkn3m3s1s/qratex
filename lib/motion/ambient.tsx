'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotionPref } from './use-reduced-motion-pref';

/**
 * Dekoratif sonsuz animasyonların (yörünge, parıltı, aurora, parçacık) TEK
 * sarmalayıcısı. Kurallar (yol haritası §4.2 madde 4):
 *  - Yalnız play kaydında kullanılır (operasyon yüzeyinde nabız/marquee yok).
 *  - Azaltılmış harekette çocuklar HİÇ render edilmez → `fallback` (statik kare).
 *  - Görünür alanın dışındayken ve sekme gizliyken (`document.hidden`) durur:
 *    çocuklar unmount edilir ya da `pauseMode="hidden"` ile CSS animasyonu duraklatılır.
 */
export function Ambient({
  children,
  fallback = null,
  pauseMode = 'unmount',
  rootMargin = '120px',
  className,
}: {
  children: ReactNode;
  /** Azaltılmış harekette veya durdurulmuşken gösterilecek statik içerik. */
  fallback?: ReactNode;
  /** `unmount`: görünmezken çocukları kaldırır (canvas/rAF için). `hidden`: `animation-play-state: paused`. */
  pauseMode?: 'unmount' | 'hidden';
  rootMargin?: string;
  className?: string;
}) {
  const reduce = useReducedMotionPref();
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => setPageVisible(!document.hidden);
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const running = !reduce && inView && pageVisible;

  if (pauseMode === 'hidden') {
    return (
      <div
        ref={ref}
        aria-hidden
        className={className}
        data-ambient={running ? 'running' : 'paused'}
        style={running ? undefined : { animationPlayState: 'paused' }}
      >
        {reduce ? fallback : children}
      </div>
    );
  }

  return (
    <div ref={ref} aria-hidden className={className} data-ambient={running ? 'running' : 'paused'}>
      {running ? children : fallback}
    </div>
  );
}
