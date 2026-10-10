'use client';

import type { ReactNode } from 'react';
import { m as Motion } from 'framer-motion';
import { DURATION, EASE, SPRING, useMotionPolicy } from '@/lib/motion';

/**
 * Deneyim kartının tek seferlik "açılış" girişi (play kaydı, yol haritası §4.2):
 * Y ekseninde 70° → 0° hafif ters dönme + belirme. Perspektif DIŞ sarmalayıcıda (CSS),
 * dönüş İÇ `Motion` öğesinde — framer'ın inline transform'u konumlandırmayı ezmez.
 * Azaltılmış harekette yalnız kısa opaklık geçişi. Sonsuz döngü yok.
 */
export function CardReveal({ children, className }: { children: ReactNode; className?: string }) {
  const policy = useMotionPolicy();
  return (
    <div className={className} style={{ perspective: 1200 }}>
      <Motion.div
        initial={policy.reduce ? { opacity: 0 } : { opacity: 0, rotateY: 70, scale: 0.96 }}
        animate={policy.reduce ? { opacity: 1 } : { opacity: 1, rotateY: 0, scale: 1 }}
        transition={
          policy.reduce
            ? { duration: DURATION.base, ease: EASE.standard }
            : { ...SPRING.gentle, opacity: { duration: DURATION.slow, ease: EASE.emphasized } }
        }
        style={{ transformOrigin: '50% 50%', backfaceVisibility: 'hidden' }}
      >
        {children}
      </Motion.div>
    </div>
  );
}

/** CTA bölümü: kartın ardından gecikmeli, yumuşak belirme (≤ slow). */
export function DelayedFade({ children, delay = 0.25, className }: { children: ReactNode; delay?: number; className?: string }) {
  const policy = useMotionPolicy();
  return (
    <Motion.div
      className={className}
      initial={{ opacity: 0, y: policy.reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASE.emphasized, delay: policy.reduce ? 0 : delay }}
    >
      {children}
    </Motion.div>
  );
}
