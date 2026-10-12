'use client';

import { forwardRef, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { TONE_CHIP, TONE_TEXT, type Tone } from '@/components/states';
import { useNumberTicker } from '@/lib/motion';
import { useDataCopy, useLocaleInfo } from './copy';
import { DeltaBadge } from './delta-badge';
import { Sparkline } from './sparkline';
import { formatMetricValue, isLowSample, type MetricValue } from './metric-format';
import { useRegisterContext, type Register } from '../play/register';

export type MetricTileProps = {
  label: ReactNode;
  /** `MetricValue` sözleşmesi (sunucu hesaplar, istemci biçimler). */
  metric: MetricValue;
  icon?: ReactNode;
  /** İkon çipi ve sparkline tonu. */
  tone?: Tone;
  /** Kutunun tamamı bu sayfaya gider (etiket bağlantıdır, kutu tıklanabilir). */
  href?: string;
  loading?: boolean;
  /** Değer değişince say (ilk boyamada saymaz; azaltılmış harekette kapalı). */
  animate?: boolean;
  /** Değişim rozetinin yanındaki metin (varsayılan `metric.delta.label` / "önceki döneme göre"). */
  deltaLabel?: ReactNode | null;
  /** Ek ipucu (kaynak, tanım). */
  hint?: ReactNode;
  /** `metric.series` varsa mini eğilim çizgisi. Varsayılan true. */
  showSparkline?: boolean;
  /** Sparkline için erişilebilir özet (verilmezse dekoratif). */
  sparklineLabel?: string;
  /** `ops` (varsayılan): sade, tabular. `play`: display yazı, elevation 2. */
  register?: Register;
  size?: 'default' | 'compact';
  footer?: ReactNode;
  className?: string;
};

/**
 * KPI kutusu — `MetricValue` sözleşmesi: biçim (`number|currency|percent|duration`),
 * `DeltaBadge` (yön + işaret + renk + ekran okuyucu cümlesi), saf SVG `Sparkline`,
 * örneklem notu (`n = 42`, `minN` altında "Düşük örneklem" uyarısı) ve
 * yükleniyor iskeleti. Sayılar `tabular-nums`; değer yoksa "—" + "Veri yok".
 */
export const MetricTile = forwardRef<HTMLDivElement, MetricTileProps>(function MetricTile(
  {
    label,
    metric,
    icon,
    tone = 'neutral',
    href,
    loading = false,
    animate = true,
    deltaLabel,
    hint,
    showSparkline = true,
    sparklineLabel,
    register: registerProp,
    size = 'default',
    footer,
    className,
  },
  ref,
) {
  // Prop → en yakın RegisterProvider (ör. PanelPage register) → ops.
  const ctxRegister = useRegisterContext();
  const register = registerProp ?? ctxRegister ?? 'ops';
  const copy = useDataCopy();
  const { tag, locale } = useLocaleInfo();
  const numeric = typeof metric.value === 'number' && Number.isFinite(metric.value) ? metric.value : null;
  const ticked = useNumberTicker(numeric ?? 0);
  const shown = numeric == null ? null : animate && metric.format !== 'duration' ? ticked : numeric;
  // Sayaç ara değerleri kesirli olur; hedef tamsayıysa yuvarla (biçim ondalığı değişmesin).
  const display = shown == null ? null : Number.isInteger(numeric) ? Math.round(shown) : shown;
  const formatted = formatMetricValue({ ...metric, value: display }, tag, locale);
  const lowSample = isLowSample(metric.n, metric.minN);
  const play = register === 'play';
  // Ops: sıfır değerli uyarı/tehlike kutusu alarm gibi görünmesin.
  const quietTone = tone === 'neutral' || ((tone === 'warning' || tone === 'danger') && numeric === 0);
  const compact = size === 'compact';
  const series = showSparkline && metric.series && metric.series.length > 1 ? metric.series : null;
  const nFmt = (n: number) => new Intl.NumberFormat(tag).format(n);

  return (
    <div
      ref={ref}
      aria-busy={loading || undefined}
      className={cn(
        'relative flex min-w-0 flex-col rounded-card border bg-surface-1 text-fg',
        compact ? 'gap-2 p-3' : 'gap-3 p-4 sm:p-5',
        play ? 'border-brand-border/60 qx-elevation-2' : 'qx-elevation-1',
        href &&
          'transition-[border-color,box-shadow] duration-fast ease-standard hover:border-strong hover:qx-elevation-2 focus-within:ring-2 focus-within:ring-ring',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {href ? (
          <Link
            href={href}
            className="qx-small font-medium text-fg-muted outline-none after:absolute after:inset-0 after:rounded-card hover:text-fg"
          >
            {label}
          </Link>
        ) : (
          <p className="qx-small font-medium text-fg-muted">{label}</p>
        )}
        {icon && (
          <div
            aria-hidden
            className={cn(
              'grid shrink-0 place-items-center',
              play
                ? cn('rounded-control', compact ? 'h-8 w-8 [&_svg]:h-4 [&_svg]:w-4' : 'h-9 w-9 [&_svg]:h-[1.125rem] [&_svg]:w-[1.125rem]', TONE_CHIP[tone])
                : // ops: dolu renkli ikon kutusu yok — sakin glif; ton yalnız değer sıfırdan büyükse (uyarı/tehlike) renk taşır.
                  cn('h-5 w-5 [&_svg]:h-4 [&_svg]:w-4', quietTone ? 'text-fg-subtle' : TONE_TEXT[tone]),
            )}
          >
            {icon}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className={cn('w-28', compact ? 'h-6' : 'h-8')} />
          <Skeleton className="h-3 w-20" />
          {series && <Skeleton className="h-8 w-full" />}
        </div>
      ) : (
        <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-1.5')}>
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            <span
              className={cn(
                'qx-num min-w-0 break-words text-fg',
                play ? 'qx-display' : compact ? 'qx-h2' : 'qx-h1',
                numeric == null && 'text-fg-subtle',
              )}
            >
              {formatted}
            </span>
            {numeric == null && <span className="sr-only">{copy.noValue}</span>}
            {metric.unit && numeric != null && <span className="qx-small text-fg-muted">{metric.unit}</span>}
          </p>
          {metric.delta && Number.isFinite(metric.delta.value) && (
            <DeltaBadge delta={metric.delta} metric={metric} label={deltaLabel} />
          )}
          {(typeof metric.n === 'number' || hint) && (
            <p className="qx-caption flex flex-wrap items-center gap-x-2 gap-y-1 text-fg-subtle">
              {lowSample ? (
                <span
                  className={cn('inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 font-medium', TONE_CHIP.warning)}
                  title={copy.lowSampleHint(nFmt(metric.minN!))}
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {copy.lowSample}{' '}
                  {/* "· n = 11" tek parça kalsın: dar kutuda nokta/eşittir satır sonunda yetim kalıyordu. */}
                  <span className="qx-num whitespace-nowrap">· {copy.sample(nFmt(metric.n!))}</span>
                  <span className="sr-only">. {copy.lowSampleHint(nFmt(metric.minN!))}</span>
                </span>
              ) : typeof metric.n === 'number' ? (
                <span className="qx-num">{copy.sample(nFmt(metric.n))}</span>
              ) : null}
              {hint && <span>{hint}</span>}
            </p>
          )}
        </div>
      )}

      {!loading && series && (
        <Sparkline
          data={series}
          tone={tone === 'neutral' ? 'brand' : tone}
          height={compact ? 24 : 32}
          label={sparklineLabel}
          animate={play}
          className="mt-auto"
        />
      )}
      {footer && <div className="relative border-t border-subtle pt-3 qx-small text-fg-muted">{footer}</div>}
    </div>
  );
});

export type MetricGridProps = {
  children?: ReactNode;
  /** Geniş ekranda sütun sayısı; mobilde 2 (360px altında 1). */
  cols?: 2 | 3 | 4 | 5;
  className?: string;
};

const METRIC_COLS: Record<NonNullable<MetricGridProps['cols']>, string> = {
  2: 'grid-cols-1 min-[360px]:grid-cols-2',
  3: 'grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
};

/** KPI ızgarası — `MetricTile`'ları eşit yükseklikte dizer. */
export function MetricGrid({ children, cols = 4, className }: MetricGridProps) {
  return <div className={cn('grid min-w-0 gap-3 sm:gap-4', METRIC_COLS[cols], className)}>{children}</div>;
}
