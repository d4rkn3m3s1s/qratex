'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useNumberTicker } from '@/lib/motion/use-number-ticker';
import { useAppLocale } from '@/lib/app-locale';
import { useStateCopy } from './copy';
import { TONE_CHIP, type Tone } from './tone';

export type StatDelta = {
  /** Önceki döneme göre değişim (yüzde ya da mutlak). */
  value: number;
  /** `percent` (varsayılan) → "%12,4"; `absolute` → "+120". */
  format?: 'percent' | 'absolute';
  /** Hangi yön iyi? (ör. şikâyet sayısında `down`). Varsayılan `up`. */
  goodDirection?: 'up' | 'down';
  /** "önceki 30 güne göre" gibi; verilmezse "önceki döneme göre". */
  label?: ReactNode;
};

export type StatTileProps = {
  label: ReactNode;
  value: number | string | null | undefined;
  /** Sayı biçimi (Intl). Ör. `{ style: 'currency', currency: 'TRY' }`. */
  format?: Intl.NumberFormatOptions;
  /** Birim eki (ör. "puan", "dk"). */
  unit?: ReactNode;
  delta?: StatDelta;
  icon?: ReactNode;
  tone?: Tone;
  /** Ek açıklama (örneklem: "n = 42 yanıt"). */
  hint?: ReactNode;
  href?: string;
  loading?: boolean;
  /** Değer değişince say (ilk boyamada saymaz). */
  animate?: boolean;
  className?: string;
};

function useLocaleTag(): string {
  return useAppLocale().locale === 'en' ? 'en-US' : 'tr-TR';
}

/**
 * KPI kutusu — `MetricValue` sözleşmesi: etiket + değer + değişim (ikon + metin,
 * yalnız renge dayanmaz) + örneklem/ipucu. Sayılar `tabular-nums`.
 */
export function StatTile({
  label,
  value,
  format,
  unit,
  delta,
  icon,
  tone = 'neutral',
  hint,
  href,
  loading = false,
  animate = true,
  className,
}: StatTileProps) {
  const copy = useStateCopy();
  const localeTag = useLocaleTag();
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const ticked = useNumberTicker(numeric ?? 0);
  const shown = numeric == null ? null : animate ? ticked : numeric;

  const formatted =
    shown == null
      ? typeof value === 'string' && value !== ''
        ? value
        : '—'
      : new Intl.NumberFormat(localeTag, { maximumFractionDigits: 1, ...format }).format(
          // Sayaç ara değerleri kesirli olur; hedef tamsayıysa yuvarla.
          Number.isInteger(numeric) && !format?.minimumFractionDigits ? Math.round(shown) : shown,
        );

  let deltaNode: ReactNode = null;
  if (delta && Number.isFinite(delta.value)) {
    const dir = delta.value > 0 ? 'up' : delta.value < 0 ? 'down' : 'flat';
    const good = delta.goodDirection ?? 'up';
    const deltaTone: Tone = dir === 'flat' ? 'neutral' : dir === good ? 'success' : 'danger';
    const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
    const abs = Math.abs(delta.value);
    const amount =
      (delta.format ?? 'percent') === 'percent'
        ? new Intl.NumberFormat(localeTag, { style: 'percent', maximumFractionDigits: 1 }).format(abs / 100)
        : new Intl.NumberFormat(localeTag, { maximumFractionDigits: 1 }).format(abs);
    const dirWord = dir === 'up' ? copy.deltaUp : dir === 'down' ? copy.deltaDown : copy.deltaFlat;
    deltaNode = (
      <p className="qx-caption flex flex-wrap items-center gap-1.5">
        <span className={cn('inline-flex items-center gap-0.5 rounded-chip px-1.5 py-0.5 font-semibold qx-num', TONE_CHIP[deltaTone])}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {dir === 'flat' ? '0' : amount}
          <span className="sr-only"> {dirWord}</span>
        </span>
        <span className="text-fg-muted">{delta.label ?? copy.vsPrevious}</span>
      </p>
    );
  }

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="qx-small font-medium text-fg-muted">{label}</p>
        {icon && (
          <div aria-hidden className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-control [&_svg]:h-[1.125rem] [&_svg]:w-[1.125rem]', TONE_CHIP[tone])}>
            {icon}
          </div>
        )}
      </div>
      {loading ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="flex items-baseline gap-1.5">
            <span className="qx-num text-[1.75rem] font-bold leading-9 tracking-tight text-fg">{formatted}</span>
            {unit && <span className="qx-small text-fg-muted">{unit}</span>}
          </p>
          {deltaNode}
          {hint && <p className="qx-caption text-fg-subtle">{hint}</p>}
        </div>
      )}
    </>
  );

  const base = cn(
    'flex min-w-0 flex-col gap-3 rounded-card border bg-surface-1 p-4 qx-elevation-1 sm:p-5',
    href && 'transition-[border-color,box-shadow] duration-fast ease-standard hover:border-strong hover:qx-elevation-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={base} aria-busy={loading || undefined}>
        {body}
      </Link>
    );
  }
  return (
    <div className={base} aria-busy={loading || undefined}>
      {body}
    </div>
  );
}
