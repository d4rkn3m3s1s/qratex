'use client';

import type { ElementType, ReactNode } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export type AdminProgressTrend = {
  label: string;
  direction: 'up' | 'down' | 'neutral';
};

export type AdminProgressStatCardProps = {
  label: string;
  /** Ana sayı veya metin */
  value: ReactNode;
  /** Erişilebilir özet */
  valueDescription?: string;
  /** 0–100 gösterim; verilmezse sadece spark + trend */
  progress?: number;
  trend?: AdminProgressTrend;
  /** 0–1 arası yaklaşık 7 nokta; yoksa `seed` ile üretilir */
  spark?: number[];
  /** Spark çizgisi için deterministik tohum (ör. toplam kullanıcı sayısı) */
  sparkSeed?: number;
  icon?: ElementType;
  className?: string;
  onClick?: () => void;
};

function defaultSpark(seed: number): number[] {
  let x = seed % 2147483647 || 1;
  const next = () => {
    x = (x * 48271) % 2147483647;
    return (x % 100) / 100;
  };
  return Array.from({ length: 7 }, () => 0.28 + next() * 0.55);
}

function MiniSpark({ pts, className }: { pts: number[]; className?: string }) {
  const w = 56;
  const h = 22;
  const pad = 2;
  const step = (w - pad * 2) / (pts.length - 1);
  const d = pts
    .map((p, i) => {
      const x = pad + i * step;
      const y = pad + (1 - p) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={cn('shrink-0 text-emerald-600/80 dark:text-cyan-300/90', className)}
      aria-hidden
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TrendBadge({ trend }: { trend: AdminProgressTrend }) {
  const Icon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
  const cls =
    trend.direction === 'up'
      ? 'text-emerald-700 bg-emerald-100/90 dark:text-emerald-200 dark:bg-emerald-500/15'
      : trend.direction === 'down'
        ? 'text-red-700 bg-red-100/90 dark:text-red-200 dark:bg-red-500/15'
        : 'text-slate-600 bg-slate-200/80 dark:text-slate-300 dark:bg-white/10';

  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', cls)}>
      <Icon className="size-3" aria-hidden />
      {trend.label}
    </span>
  );
}

/**
 * Aniq tarzı: etiket + değer + mini spark + isteğe bağlı % çubuğu + trend rozeti.
 * Tıklanabilir `onClick` verilirse `button`, yoksa `article`.
 */
export function AdminProgressStatCard({
  label,
  value,
  valueDescription,
  progress,
  trend,
  spark,
  sparkSeed = 0,
  icon: Icon,
  className,
  onClick,
}: AdminProgressStatCardProps) {
  const pts = spark ?? defaultSpark(sparkSeed);
  const progressClamped = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-xl font-bold tabular-nums tracking-tight text-emerald-950 dark:text-white sm:text-2xl">{value}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MiniSpark pts={pts} />
          {Icon ? (
            <span className="flex size-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/90 text-teal-600 shadow-sm dark:border-white/15 dark:bg-white/10 dark:text-cyan-200">
              <Icon className="size-4" aria-hidden />
            </span>
          ) : null}
        </div>
      </div>

      {progressClamped !== undefined ? (
        <div className="mt-3 space-y-1">
          <Progress
            value={progressClamped}
            className="h-1.5 bg-emerald-100/90 dark:bg-white/10"
            indicatorClassName="bg-gradient-to-r from-emerald-500 to-cyan-500 dark:from-teal-400 dark:to-cyan-400"
          />
          <p className="text-[10px] text-slate-500 dark:text-slate-400">{progressClamped}%</p>
        </div>
      ) : (
        <div
          className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent dark:via-cyan-400/25"
          aria-hidden
        />
      )}

      {trend ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TrendBadge trend={trend} />
        </div>
      ) : null}
    </>
  );

  const shellClass = cn(
    'w-full rounded-xl border p-3 text-left shadow-sm transition-[box-shadow,transform,border-color] duration-200 sm:p-4',
    'border-emerald-100/90 bg-white/95 hover:border-emerald-200 hover:shadow-md',
    'dark:border-white/15 dark:bg-white/[0.08] dark:hover:border-white/25 dark:hover:bg-white/[0.11]',
    onClick && 'cursor-pointer active:scale-[0.99]',
    className
  );

  if (onClick) {
    return (
      <button type="button" className={shellClass} onClick={onClick} aria-label={valueDescription ?? `${label}: ${String(value)}`}>
        {inner}
      </button>
    );
  }

  return (
    <article className={shellClass} aria-label={valueDescription ?? `${label}: ${String(value)}`}>
      {inner}
    </article>
  );
}
