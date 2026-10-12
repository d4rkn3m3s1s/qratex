'use client';

/**
 * recharts ilk çizim animasyonu — kısa ve sakin (≤480ms, ease-out).
 * Yalnız ilk çizimde oynar; veri yenilemelerinde (filtre/poll) tekrar
 * oynamaz, böylece grafik "zıplamaz". reduced-motion'da tamamen kapalı.
 * Kullanım: `const enter = useChartEnter(); <Bar {...enter} />`
 * İkinci seri hafif gecikme için: `useChartEnter()` + `chartEnterDelay(enter, i)`.
 */
import { useEffect, useState } from 'react';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion-pref';

export interface ChartEnterProps {
  isAnimationActive: boolean;
  animationDuration: number;
  animationBegin: number;
  animationEasing: 'ease-out';
}

export function useChartEnter(duration = 460): ChartEnterProps {
  const reduce = useReducedMotionPref();
  const [first, setFirst] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setFirst(false), duration + 200);
    return () => window.clearTimeout(t);
  }, [duration]);
  return { isAnimationActive: !reduce && first, animationDuration: duration, animationBegin: 0, animationEasing: 'ease-out' };
}

/** Seri sırasına göre en çok 120ms kademeli başlangıç (toplam <600ms). */
export function chartEnterDelay(p: ChartEnterProps, index: number): ChartEnterProps {
  return { ...p, animationBegin: Math.min(120, index * 40), animationDuration: Math.max(300, p.animationDuration - Math.min(120, index * 40)) };
}
