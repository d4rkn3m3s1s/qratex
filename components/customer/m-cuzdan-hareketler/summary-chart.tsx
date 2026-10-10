'use client';

/**
 * Hafif SVG sütun grafiği (recharts YOK — ops ekranı, birkaç KB). Grafik `aria-hidden`;
 * aynı veri ekran okuyucuya tablo olarak sunulur. Sütunlar ilk görünüşte tabandan büyür
 * (`slow`, kademe bütçesi ≤ 0,6 sn); azaltılmış harekette statik.
 */
import { m as Motion } from 'framer-motion';
import { DURATION, EASE, staggerDelay, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { SummaryBucket } from '@/lib/customer-wallet/periods';
import type { Formatters } from './format';

type Point = { key: string; value: number };

export function SummaryChart({
  points,
  bucket,
  fmt,
  formatValue,
  caption,
  valueHeader,
  bucketHeader,
  currentKey,
}: {
  points: Point[];
  bucket: SummaryBucket;
  fmt: Formatters;
  formatValue: (n: number) => string;
  caption: string;
  valueHeader: string;
  bucketHeader: string;
  /** İçinde bulunulan kova (vurgulanır). */
  currentKey: string | null;
}) {
  const reduce = useReducedMotionPref();
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = Math.max(1, points.length);
  const W = 100;
  const H = 40;
  const gap = n > 20 ? 0.6 : 1.4;
  const barW = Math.max(0.8, (W - gap * (n - 1)) / n);
  // Etiket yoğunluğu: en fazla ~7 etiket.
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  return (
    <figure className="min-w-0">
      <div aria-hidden className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-40 w-full sm:h-48">
          <line x1="0" x2={W} y1={H - 0.1} y2={H - 0.1} stroke="hsl(var(--border-subtle))" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => {
            const h = p.value > 0 ? Math.max(0.8, (p.value / max) * (H - 2)) : 0;
            const x = i * (barW + gap);
            const current = p.key === currentKey;
            return (
              <Motion.rect
                key={p.key}
                x={x}
                y={H - h}
                width={barW}
                height={h}
                rx={Math.min(0.8, barW / 3)}
                fill={current ? 'hsl(var(--brand))' : 'hsl(var(--brand) / 0.45)'}
                style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: DURATION.slow, ease: EASE.emphasized, delay: reduce ? 0 : staggerDelay(i, 0.025) }}
              />
            );
          })}
        </svg>
        <div className="mt-1 flex">
          {points.map((p, i) => (
            <span
              key={p.key}
              className={cn('qx-caption min-w-0 flex-1 truncate text-center text-fg-subtle', p.key === currentKey && 'font-semibold text-fg')}
            >
              {i % labelEvery === 0 || p.key === currentKey ? fmt.bucketLabel(p.key, bucket) : ''}
            </span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{bucketHeader}</th>
            <th scope="col">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{fmt.bucketLabelLong(p.key, bucket)}</th>
              <td>{formatValue(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
