'use client';

import { cn } from '@/lib/utils';

/**
 * Dairesel ilerleme halkası (saf SVG, hafif). Yatay bar yerine yüzde göstergesi.
 * value: 0–100.
 */
export function ProgressRing({
  value, size = 88, stroke = 8, className, label, sublabel, colorClass = 'text-emerald-500',
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  label?: React.ReactNode;
  sublabel?: string;
  colorClass?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={cn('relative inline-grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={cn('transition-[stroke-dashoffset] duration-700 ease-out', colorClass)}
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <div className="text-lg font-bold">{label ?? `%${Math.round(clamped)}`}</div>
          {sublabel && <div className="mt-0.5 text-[10px] text-muted-foreground">{sublabel}</div>}
        </div>
      </div>
    </div>
  );
}
