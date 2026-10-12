'use client';

import { forwardRef, useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { m as Motion } from 'framer-motion';
import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING, useReducedMotionPref } from '@/lib/motion';
import { AnimatedNumber } from '../data/animated-number';
import { useRegister, type Register } from './register';
import { usePlayLocale } from './locale';
import { FOCUS_RING, TOUCH_TARGET, formatInt, type PlayLocale, type PlaySize } from './shared';

export type PointsChipTone = 'brand' | 'gold';

export type PointsChipProps = Omit<ButtonHTMLAttributes<HTMLElement>, 'children' | 'type'> & {
  /** Güncel bakiye. Değiştiğinde önceki değerden yumuşakça sayar (ilk boyamada saymaz). */
  value: number;
  /** Birim etiketi. Varsayılan: "puan" / "pts". `null` → gizli (yine ekran okuyucuya söylenir). */
  unit?: ReactNode | null;
  /** Ön ikon. Varsayılan: madeni para. */
  icon?: ReactNode;
  tone?: PointsChipTone;
  size?: PlaySize;
  /**
   * An Motoru puan kapsülünün uçuş hedefi: `data-moment-anchor="points"`.
   * Sayfada yalnız BİR çip hedef olmalı (üst çubuktaki bakiye). Varsayılan `false`.
   */
  momentAnchor?: boolean;
  /** Bakiye değişimini ekran okuyucuya duyur (`aria-live="polite"`). */
  announce?: boolean;
  /** Tıklanabilir çip (ör. cüzdana git). Verilirse `<button>` ve ≥ 44px hedef. */
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  register?: Register;
  /** Dil; verilmezse uygulama dili (`AppLocaleProvider`, yoksa `tr`). */
  locale?: PlayLocale;
};

/**
 * An Motoru kapsülü hedefe vardığında çipte bu olayı tetikler; çip bir kez
 * "nabız" atar (azaltılmış harekette ve ops kaydında yok sayılır):
 *   document.querySelector('[data-moment-anchor="points"]')
 *     ?.dispatchEvent(new CustomEvent(MOMENT_PULSE_EVENT));
 */
export const MOMENT_PULSE_EVENT = 'qx:moment-pulse';

const SIZE: Record<PlaySize, { root: string; icon: string }> = {
  sm: { root: 'h-7 gap-1 px-2 qx-caption', icon: 'size-3.5' },
  md: { root: 'h-8 gap-1.5 px-3 qx-small', icon: 'size-4' },
  lg: { root: 'h-10 gap-2 px-4 qx-body', icon: 'size-5' },
};

const TONE: Record<PointsChipTone, { chip: string; icon: string }> = {
  brand: { chip: 'bg-brand-subtle text-brand ring-1 ring-inset ring-brand-border', icon: 'text-brand' },
  gold: { chip: 'bg-warning-subtle text-warning ring-1 ring-inset ring-warning-border', icon: 'text-warning' },
};

const COPY: Record<PlayLocale, { unit: string; label: (n: string) => string }> = {
  tr: { unit: 'puan', label: (n) => `${n} puan` },
  en: { unit: 'pts', label: (n) => `${n} points` },
};

/**
 * Puan bakiyesi kapsülü. Değer artınca sayı sayar ve ikon kısa bir yay ile
 * "zıplar" (yalnız play, azaltılmışta yok). Görsel sayı her karede değişse de
 * ekran okuyucu yalnız son değeri okur.
 */
export const PointsChip = forwardRef<HTMLElement, PointsChipProps>(function PointsChip(
  {
    value,
    unit,
    icon,
    tone = 'brand',
    size = 'md',
    momentAnchor = false,
    announce = false,
    onClick,
    register,
    locale: localeProp,
    className,
    ...rest
  },
  forwardedRef,
) {
  const locale = usePlayLocale(localeProp);
  const innerRef = useRef<HTMLElement | null>(null);
  const reg = useRegister(register, innerRef);
  const reduce = useReducedMotionPref();
  const prev = useRef(value);
  const [bump, setBump] = useState(0);
  const expressive = reg === 'play' && !reduce;

  useEffect(() => {
    if (value > prev.current && expressive) setBump((b) => b + 1);
    prev.current = value;
  }, [value, expressive]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el || !expressive) return;
    const onPulse = () => setBump((b) => b + 1);
    el.addEventListener(MOMENT_PULSE_EVENT, onPulse);
    return () => el.removeEventListener(MOMENT_PULSE_EVENT, onPulse);
  }, [expressive]);

  const setRef = useCallback(
    (node: HTMLElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  const s = SIZE[size];
  const t = TONE[tone];
  const copy = COPY[locale];
  const finalText = formatInt(value, locale);
  const unitNode = unit === undefined ? copy.unit : unit;

  const iconNode = (
    <Motion.span
      key={bump}
      aria-hidden
      className={cn('inline-flex shrink-0', t.icon)}
      initial={bump > 0 ? { scale: 1.25 } : false}
      animate={{ scale: 1 }}
      transition={SPRING.bouncy}
    >
      {icon ?? <Coins className={s.icon} />}
    </Motion.span>
  );

  const body = (
    <>
      {iconNode}
      <span aria-hidden className="qx-num font-semibold">
        <AnimatedNumber value={value} format={(n) => formatInt(n, locale)} srLabel={null} />
      </span>
      {unitNode !== null && (
        <span aria-hidden className="font-medium">
          {unitNode}
        </span>
      )}
      <span className="sr-only" aria-live={announce ? 'polite' : undefined} aria-atomic="true">
        {copy.label(finalText)}
      </span>
    </>
  );

  const shared = {
    'data-moment-anchor': momentAnchor ? 'points' : undefined,
    className: cn(
      'inline-flex select-none items-center whitespace-nowrap rounded-full transition-colors duration-fast ease-standard',
      s.root,
      t.chip,
      reg === 'play' && 'qx-elevation-1',
      className,
    ),
  };

  if (onClick) {
    return (
      <button
        {...rest}
        {...shared}
        ref={setRef as Ref<HTMLButtonElement>}
        type="button"
        onClick={onClick}
        className={cn(shared.className, TOUCH_TARGET, FOCUS_RING, 'justify-center hover:brightness-[0.97] dark:hover:brightness-110')}
      >
        {body}
      </button>
    );
  }

  return (
    <span {...rest} {...shared} ref={setRef as Ref<HTMLSpanElement>}>
      {body}
    </span>
  );
});
