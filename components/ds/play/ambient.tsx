'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useMotionPolicy } from '@/lib/motion';
import { useRegister, type Register } from './register';

/**
 * play kaydının sonsuz döngü sarmalayıcısı.
 *
 * `lib/motion` → `<Ambient>` ile aynı politika (yalnız görünürken, sekme gizli
 * değilken, hareket politikası izin verdiğinde) + bileşen kitinin ihtiyaçları:
 *  - **kayıt kapısı:** `ops` kaydında döngü HİÇ çalışmaz (yol haritası §4.2 madde 4);
 *  - **satır içi kullanım:** `as="span"` → çip/rozet içinde geçerli HTML;
 *  - **render-prop:** `children(running)` ile durdurulmuş halde aynı düğüm
 *    korunur (yeniden bağlanma titremesi olmadan statik kareye düşer).
 *
 * Çocuk ReactNode ise çalışmıyorken `fallback` gösterilir (varsayılan: hiçbir şey).
 * `repeat: Infinity` içeren her framer animasyonu bu sarmalayıcının İÇİNDE olmalı.
 */
export type AmbientProps = {
  children: ReactNode | ((running: boolean) => ReactNode);
  /** Döngü çalışmıyorken (azaltılmış, görünmez, gizli sekme, ops) statik kare. */
  fallback?: ReactNode;
  /** Kök eleman. Satır içi bağlamda `span`. */
  as?: 'div' | 'span';
  register?: Register;
  /** Görünürlük eşiği için IntersectionObserver kenar payı. */
  rootMargin?: string;
  className?: string;
};

export function Ambient({ children, fallback = null, as = 'div', register, rootMargin = '120px', className }: AmbientProps) {
  const ref = useRef<HTMLElement | null>(null);
  const reg = useRegister(register, ref);
  const { allowAmbient } = useMotionPolicy();
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

  const running = reg === 'play' && allowAmbient && inView && pageVisible;
  const content = typeof children === 'function' ? children(running) : running ? children : fallback;

  const Root = as;
  return (
    <Root ref={ref as RefObject<HTMLDivElement & HTMLSpanElement>} aria-hidden className={className} data-ambient={running ? 'running' : 'paused'}>
      {content}
    </Root>
  );
}
