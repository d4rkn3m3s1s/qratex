'use client';

import * as React from 'react';
import { m as Motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { useA11yCopy } from './copy';

export type RatingScale = 'five' | 'nps';
export type RatingAppearance = 'star' | 'emoji' | 'number';

type LabelProps =
  | { 'aria-label': string; 'aria-labelledby'?: string }
  | { 'aria-label'?: string; 'aria-labelledby': string };

export type RatingInputProps = LabelProps & {
  /** Seçili değer; seçim yoksa `null`. */
  value: number | null | undefined;
  onChange?: (value: number) => void;
  /** `five`: 1–5 (varsayılan) · `nps`: 0–10 Net Promoter Score. */
  scale?: RatingScale;
  /** `star` (five varsayılanı) · `emoji` (yalnız five) · `number` (nps varsayılanı). */
  appearance?: RatingAppearance;
  /** `md` 44px · `lg` 56px dokunma hedefi (müşteri anket akışında önerilir). */
  size?: 'md' | 'lg';
  /** `play`: seçimde küçük yaylı vurgu (azaltılmış harekette kapalı). */
  register?: 'ops' | 'play';
  /** Ölçek uç etiketleri (NPS'te varsayılan "Hiç olası değil" / "Kesinlikle"). `false` → gizle. */
  lowLabel?: React.ReactNode | false;
  highLabel?: React.ReactNode | false;
  /** Her seçenek için ekran okuyucu metni (varsayılan: "4 / 5 yıldız", "8 puan", "İyi"). */
  getItemLabel?: (value: number) => string;
  /** Yerel `<form>` gönderimi için gizli input adı. */
  name?: string;
  id?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  invalid?: boolean;
  'aria-describedby'?: string;
  className?: string;
  /** Odak taşıma (RHF hata odağı) — seçili ya da ilk öğeye odaklanır. */
  ref?: React.Ref<{ focus: () => void }>;
  onBlur?: () => void;
};

const EMOJI = ['😞', '🙁', '😐', '🙂', '😍'] as const;

/** NPS kovası — renk yalnız destek; anlam metin ve konumla da verilir. */
function npsTone(v: number): 'danger' | 'warning' | 'success' {
  if (v <= 6) return 'danger';
  if (v <= 8) return 'warning';
  return 'success';
}

const NPS_SELECTED: Record<'danger' | 'warning' | 'success', string> = {
  danger: 'border-danger bg-danger text-danger-fg',
  warning: 'border-warning bg-warning text-warning-fg',
  success: 'border-success bg-success text-success-fg',
};

/**
 * Derecelendirme girişi — WAI-ARIA radiogroup deseni.
 * Klavye: ←/→/↑/↓ seçimi değiştirir (uçlarda durur), Home/End, rakam tuşları
 * doğrudan seçer (NPS'te 0–9), Boşluk/Enter odaktakini seçer. Grupta tek sekme durağı.
 *
 *   <RatingInput aria-label="Hizmeti puanlayın" value={v} onChange={setV} />
 *   <RatingInput aria-labelledby="nps-q" scale="nps" value={nps} onChange={setNps} size="lg" />
 *   <RatingInput aria-label="Ruh hâli" appearance="emoji" value={m} onChange={setM} register="play" />
 */
export function RatingInput(props: RatingInputProps) {
  const {
    value,
    onChange,
    scale = 'five',
    size = 'md',
    register = 'ops',
    lowLabel,
    highLabel,
    getItemLabel,
    name,
    id,
    disabled = false,
    readOnly = false,
    required,
    invalid,
    className,
    ref,
    onBlur,
  } = props;
  const appearance: RatingAppearance =
    props.appearance === 'emoji' && scale === 'nps' ? 'number' : (props.appearance ?? (scale === 'nps' ? 'number' : 'star'));
  const copy = useA11yCopy();
  const policy = useMotionPolicy();
  const min = scale === 'nps' ? 0 : 1;
  const max = scale === 'nps' ? 10 : 5;
  const items = React.useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);
  const current = typeof value === 'number' && value >= min && value <= max ? value : null;
  const [hover, setHover] = React.useState<number | null>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const interactive = !disabled && !readOnly;

  React.useImperativeHandle(
    ref,
    () => ({
      focus: () => itemRefs.current[(current ?? min) - min]?.focus(),
    }),
    [current, min],
  );

  const showEnds = scale === 'nps' || lowLabel != null || highLabel != null;
  const low = lowLabel === false ? null : (lowLabel ?? (scale === 'nps' ? copy.npsLow : null));
  const high = highLabel === false ? null : (highLabel ?? (scale === 'nps' ? copy.npsHigh : null));

  const labelFor = (v: number): string => {
    if (getItemLabel) return getItemLabel(v);
    if (appearance === 'emoji') return copy.ratingEmoji[v - 1] ?? String(v);
    if (appearance === 'star') return copy.ratingStar(v, max);
    // Uç etiketleri görsel olarak aria-hidden; anlamı uç seçeneklerin adına eklenir.
    if (v === min && typeof low === 'string') return `${copy.ratingNumber(v)}, ${low}`;
    if (v === max && typeof high === 'string') return `${copy.ratingNumber(v)}, ${high}`;
    return copy.ratingNumber(v);
  };

  const select = (v: number, focus = true) => {
    if (!interactive) return;
    const next = Math.min(max, Math.max(min, v));
    if (next !== current) onChange?.(next);
    if (focus) itemRefs.current[next - min]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, v: number) => {
    if (!interactive) return;
    const key = event.key;
    let handled = true;
    if (key === 'ArrowRight' || key === 'ArrowUp') select(v + 1);
    else if (key === 'ArrowLeft' || key === 'ArrowDown') select(v - 1);
    else if (key === 'Home') select(min);
    else if (key === 'End') select(max);
    else if (key === ' ' || key === 'Enter') select(v, false);
    else if (/^[0-9]$/.test(key)) {
      const digit = Number(key);
      if (digit >= min && digit <= max) select(digit);
      else handled = false;
    } else handled = false;
    if (handled) event.preventDefault();
  };

  const tabStop = current ?? min;
  const display = interactive && hover != null ? hover : current;
  const play = register === 'play';

  const box = size === 'lg' ? 'h-14 min-w-14' : 'h-11 min-w-11';

  return (
    <div className={cn('inline-flex max-w-full flex-col gap-2', className)} data-register={register}>
      <div
        id={id}
        role="radiogroup"
        aria-label={props['aria-label']}
        aria-labelledby={props['aria-labelledby']}
        aria-describedby={props['aria-describedby']}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-disabled={disabled || undefined}
        aria-readonly={readOnly || undefined}
        onPointerLeave={() => setHover(null)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur?.();
        }}
        className={cn(
          'flex max-w-full',
          appearance === 'number' && scale === 'nps'
            ? 'grid grid-cols-6 gap-1.5 sm:flex sm:flex-nowrap sm:gap-1'
            : 'flex-wrap gap-1',
          invalid && 'rounded-control ring-2 ring-danger ring-offset-2 ring-offset-background',
        )}
      >
        {items.map((v) => {
          const checked = current === v;
          const filled = appearance === 'star' && display != null && v <= display;
          const tone = scale === 'nps' ? npsTone(v) : null;
          return (
            <button
              key={v}
              ref={(el) => {
                itemRefs.current[v - min] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={labelFor(v)}
              tabIndex={v === tabStop ? 0 : -1}
              disabled={disabled}
              onClick={() => select(v, false)}
              onKeyDown={(e) => onKeyDown(e, v)}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') setHover(v);
              }}
              className={cn(
                'relative inline-flex shrink-0 touch-manipulation select-none items-center justify-center rounded-control',
                'transition-[color,background-color,border-color,box-shadow,opacity,filter] duration-fast ease-standard',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:cursor-not-allowed disabled:opacity-50',
                interactive ? 'cursor-pointer' : 'cursor-default',
                box,
                appearance === 'number' && [
                  'qx-num border px-2 font-semibold',
                  size === 'lg' ? 'qx-h3' : 'qx-body',
                  checked
                    ? tone
                      ? NPS_SELECTED[tone]
                      : 'border-brand bg-brand text-brand-fg'
                    : 'border-strong bg-surface-1 text-fg hover:bg-surface-3',
                ],
                appearance === 'emoji' && [
                  size === 'lg' ? 'text-4xl' : 'text-3xl',
                  checked
                    ? 'bg-brand-subtle ring-2 ring-inset ring-brand'
                    : display === v
                      ? 'bg-surface-3'
                      : 'opacity-70 grayscale hover:opacity-100 hover:grayscale-0',
                ],
                appearance === 'star' && 'hover:bg-surface-3',
              )}
            >
              <Motion.span
                aria-hidden
                className="inline-flex items-center justify-center"
                animate={checked && play && !policy.reduce ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                transition={{ duration: DURATION.slow, ease: EASE.emphasized }}
              >
                {appearance === 'star' ? (
                  <Star
                    className={cn(
                      size === 'lg' ? 'h-9 w-9' : 'h-7 w-7',
                      'transition-[color,fill] duration-fast',
                      filled ? 'fill-warning text-warning' : 'fill-transparent text-fg-subtle',
                    )}
                    strokeWidth={1.75}
                  />
                ) : appearance === 'emoji' ? (
                  EMOJI[v - 1]
                ) : (
                  v
                )}
              </Motion.span>
            </button>
          );
        })}
      </div>

      {showEnds && (low || high) && (
        <div className="qx-caption flex items-start justify-between gap-4 text-fg-muted" aria-hidden>
          <span>{low}</span>
          <span className="text-right">{high}</span>
        </div>
      )}

      {appearance === 'emoji' && current != null && (
        <p className="qx-small text-center font-medium text-fg" aria-hidden>
          {labelFor(current)}
        </p>
      )}

      {name && <input type="hidden" name={name} value={current ?? ''} />}
    </div>
  );
}
