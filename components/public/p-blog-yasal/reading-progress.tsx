'use client';

import { m as Motion, useScroll, useSpring } from 'framer-motion';
import { useReducedMotionPref } from '@/lib/motion';

/**
 * Okuma ilerleme çubuğu — yalnız `scaleX` (transform; yerleşim tetiklemez). Konum dış
 * sarmalayıcıda (sabit, üstte), animasyon içteki `m.div`'de (framer transform'u Tailwind
 * konumunu ezmesin). Azaltılmış harekette yaylanma kapalı: çubuk kaydırmayı birebir izler.
 * Dekoratif değil ama bilgi de taşımaz → ekran okuyucudan gizli.
 */
export function ReadingProgress() {
  const reduce = useReducedMotionPref();
  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, { stiffness: 220, damping: 40, mass: 0.3 });
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 print:hidden">
      <Motion.div className="h-full origin-left bg-brand" style={{ scaleX: reduce ? scrollYProgress : smooth }} />
    </div>
  );
}
