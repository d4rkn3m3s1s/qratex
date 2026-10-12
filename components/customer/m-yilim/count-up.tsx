'use client';

/**
 * Slayt açılışında sayı 0'dan hedefe sayar — QDL `AnimatedNumber` üzerine ince sarmalayıcı
 * (≤ `celebrate` süresi; azaltılmış harekette doğrudan son değer, ekran okuyucu yalnız son değeri okur).
 */
import { AnimatedNumber } from '@/components/ds/data/animated-number';
import { DURATION_MS } from '@/lib/motion';

export function CountUp({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  return <AnimatedNumber value={value} format={format} animateOnMount durationMs={DURATION_MS.celebrate} className={className} />;
}
