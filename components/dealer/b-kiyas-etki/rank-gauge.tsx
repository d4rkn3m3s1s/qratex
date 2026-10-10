'use client';

/**
 * Sıralama yarım halkası (denetim B1): doluluk = "akranların yüzde kaçından iyi" (büyük = iyi),
 * ortadaki etiket "Üst %X" (küçük = iyi). Renk de aynı yönde: iyi yarı başarı, alt çeyrek uyarı.
 * Halka bir kez dolar (≤ 600 ms); azaltılmış harekette anında. SVG `aria-hidden`, anlam metinde.
 */
import { useEffect, useState } from 'react';
import { useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';

const R = 52;
const LEN = Math.PI * R;

export function RankGauge({ betterThan, center, sub, label }: { betterThan: number; center: string; sub?: string; label: string }) {
  const reduce = useReducedMotionPref();
  const [shown, setShown] = useState(reduce ? betterThan : 0);
  useEffect(() => {
    if (reduce) {
      setShown(betterThan);
      return;
    }
    const id = window.requestAnimationFrame(() => setShown(betterThan));
    return () => window.cancelAnimationFrame(id);
  }, [betterThan, reduce]);

  const pct = Math.max(0, Math.min(100, shown));
  const tone = betterThan >= 50 ? 'text-success' : betterThan >= 25 ? 'text-warning' : 'text-danger';

  return (
    <figure className="relative mx-auto w-full max-w-[15rem]" aria-label={label} role="img">
      <svg viewBox="0 0 128 72" className="w-full" aria-hidden>
        <path d={`M 12 64 A ${R} ${R} 0 0 1 116 64`} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-[hsl(var(--border-subtle))]" />
        <path
          d={`M 12 64 A ${R} ${R} 0 0 1 116 64`}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={LEN}
          strokeDashoffset={LEN * (1 - pct / 100)}
          className={cn(tone, 'transition-[stroke-dashoffset] duration-slow ease-emphasized motion-reduce:transition-none')}
        />
      </svg>
      <figcaption className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="qx-h2 font-semibold tabular-nums text-fg">{center}</span>
        {sub && <span className="qx-caption text-fg-muted">{sub}</span>}
      </figcaption>
    </figure>
  );
}
