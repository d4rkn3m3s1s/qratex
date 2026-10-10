'use client';

import { forwardRef, useMemo } from 'react';
import { m as Motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TONE_TEXT, type Tone } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { sparklineGeometry } from './sparkline-geometry';

export type SparklineProps = {
  data: ReadonlyArray<number | null | undefined>;
  /** Anlam tonu (çizgi rengi). Varsayılan `brand`. */
  tone?: Tone;
  /** Piksel yükseklik; genişlik kabı doldurur. */
  height?: number;
  /** Alan dolgusu. */
  area?: boolean;
  /** Son noktayı işaretle. */
  showLast?: boolean;
  /** Y eksenini 0'dan başlat (hacim metriklerinde yanıltıcı eğimi önler). */
  zeroBased?: boolean;
  strokeWidth?: number;
  /**
   * Erişilebilir özet (ör. "Son 14 gün: 120'den 168'e yükseldi").
   * Verilmezse grafik dekoratif sayılır (`aria-hidden`) — yanındaki metin
   * değeri zaten söylüyorsa doğru tercih budur.
   */
  label?: string;
  /** Play kaydı: çizgi bir kez çizilerek girer (azaltılmış harekette kapalı). */
  animate?: boolean;
  className?: string;
};

const VIEW_W = 100;

/**
 * Mini eğilim çizgisi — saf SVG (recharts yok, ~0 KB). Kabın genişliğini
 * doldurur, çizgi kalınlığı ölçekten bağımsız (`non-scaling-stroke`).
 * Renk `currentColor` → ton token'ı; açık/koyu temada otomatik.
 */
export const Sparkline = forwardRef<HTMLDivElement, SparklineProps>(function Sparkline(
  { data, tone = 'brand', height = 32, area = true, showLast = true, zeroBased = false, strokeWidth = 1.75, label, animate = false, className },
  ref,
) {
  const policy = useMotionPolicy();
  const geo = useMemo(
    () => sparklineGeometry(data, { width: VIEW_W, height, padY: Math.max(2, strokeWidth), min: zeroBased ? 0 : undefined }),
    [data, height, strokeWidth, zeroBased],
  );
  if (!geo.count) return null;

  const draw = animate && !policy.reduce;

  return (
    <div
      ref={ref}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('relative w-full min-w-0', TONE_TEXT[tone], className)}
      style={{ height }}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        className="block overflow-visible"
        focusable="false"
        aria-hidden
      >
        {area && <path d={geo.area} fill="currentColor" fillOpacity={0.12} stroke="none" />}
        {draw ? (
          <Motion.path
            d={geo.line}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: DURATION.slow * 2, ease: EASE.emphasized }}
          />
        ) : (
          <path
            d={geo.line}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {showLast && geo.last && (
        <span
          aria-hidden
          className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-surface-1"
          style={{ left: `${(geo.last.x / VIEW_W) * 100}%`, top: `${(geo.last.y / height) * 100}%` }}
        />
      )}
    </div>
  );
});
