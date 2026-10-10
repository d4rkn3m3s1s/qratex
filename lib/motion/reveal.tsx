'use client';

import type { ReactNode } from 'react';
import { m as Motion } from 'framer-motion';
import { listItem } from './variants';
import { useReducedMotionPref } from './use-reduced-motion-pref';

/**
 * Görünür alana girince bir kez `fadeUp`. `index` verilirse bütçeli kademe
 * (ilk 12 öğe, toplam ≤ 0,6 sn). Azaltılmış harekette düz `div`.
 * Konumlandırma (absolute/transform) DIŞ sarmalayıcıda yapılmalı; bu eleman
 * yalnız y/opaklık animasyonu taşır (transform çakışması kuralı).
 */
export function Reveal({
  children,
  index = 0,
  className,
  once = true,
  as = 'div',
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  once?: boolean;
  as?: 'div' | 'section' | 'li';
}) {
  const reduce = useReducedMotionPref();
  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const Comp = as === 'section' ? Motion.section : as === 'li' ? Motion.li : Motion.div;
  return (
    <Comp
      className={className}
      variants={listItem}
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: '0px 0px -10% 0px' }}
    >
      {children}
    </Comp>
  );
}
