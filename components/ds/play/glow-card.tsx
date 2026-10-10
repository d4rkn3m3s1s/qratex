'use client';

import { forwardRef, useRef, type CSSProperties, type HTMLAttributes } from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { useReducedMotionPref } from '@/lib/motion';
import { useRegister, type Register } from './register';
import { FOCUS_RING } from './shared';

export type GlowAccent =
  | 'brand'
  | 'success'
  | 'warning'
  | 'info'
  | 'category-1'
  | 'category-2'
  | 'category-3'
  | 'category-4'
  | 'category-5'
  | 'category-6'
  | 'category-7'
  | 'category-8'
  /** Özel: iki CSS rengi (ör. lig/rozet kimlik rengi). */
  | { from: string; to: string };

export type GlowCardProps = HTMLAttributes<HTMLDivElement> & {
  /** Kenar/hale rengi. Varsayılan marka gradient'i. */
  accent?: GlowAccent;
  /** Hover/odakta hale + 2px kaldırma. `asChild` ile link/buton sarmalarken açın. */
  interactive?: boolean;
  /** İç boşluk (`p-card`). Varsayılan `true`. */
  padded?: boolean;
  /** Tek çocuk elemanı kök yap (ör. `<Link>`); kenar katmanı içine eklenir. */
  asChild?: boolean;
  /** `ops` → düz kart (surface-1, ince kenarlık, elevation 1; glow/gradient yok). */
  register?: Register;
};

function accentColors(accent: GlowAccent): { from: string; to: string } {
  if (typeof accent === 'object') return accent;
  switch (accent) {
    case 'brand':
      return { from: 'hsl(var(--gradient-from))', to: 'hsl(var(--gradient-to))' };
    case 'success':
    case 'warning':
    case 'info':
      return { from: `hsl(var(--${accent}))`, to: `hsl(var(--${accent}-border))` };
    default:
      return { from: `hsl(var(--${accent}))`, to: 'hsl(var(--gradient-to))' };
  }
}

const BORDER_MASK: CSSProperties = {
  padding: 1,
  WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
  WebkitMaskComposite: 'xor',
  mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
};

/**
 * play kartı: cam yüzey + gradient kenar + (etkileşimliyse) hover/odak halesi.
 * ops kaydında düz karta düşer — aynı API, sakin görünüm (admin önizlemesi,
 * cüzdan gibi ops yüzeylerinde güvenle kullanılabilir).
 */
export const GlowCard = forwardRef<HTMLDivElement, GlowCardProps>(function GlowCard(
  { accent = 'brand', interactive = false, padded = true, asChild = false, register, className, style, children, ...rest },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reg = useRegister(register, rootRef);
  const reduce = useReducedMotionPref();
  const Comp = asChild ? Slot : 'div';
  const setRef = (node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  if (reg === 'ops') {
    return (
      <Comp
        {...rest}
        ref={setRef}
        data-register-surface="ops"
        className={cn(
          'relative block rounded-card border border-border bg-card text-card-foreground qx-elevation-1',
          padded && 'p-card',
          interactive && cn('transition-colors duration-fast ease-standard hover:border-strong', FOCUS_RING),
          className,
        )}
        style={style}
      >
        {children}
      </Comp>
    );
  }

  const { from, to } = accentColors(accent);
  const vars = {
    '--qx-glow-from': from,
    '--qx-glow-to': to,
    '--qx-glow': `color-mix(in oklab, ${from} 45%, transparent)`,
  } as CSSProperties;

  return (
    <Comp
      {...rest}
      ref={setRef}
      data-register-surface="play"
      className={cn(
        'glass relative isolate block rounded-card text-card-foreground qx-elevation-2',
        padded && 'p-card',
        interactive &&
          cn(
            'transition-[box-shadow,transform] duration-base ease-standard',
            'hover:shadow-[0_0_0_1px_var(--qx-glow),0_16px_40px_-16px_var(--qx-glow)]',
            'focus-visible:shadow-[0_0_0_1px_var(--qx-glow),0_16px_40px_-16px_var(--qx-glow)]',
            !reduce && 'hover:-translate-y-0.5',
            FOCUS_RING,
          ),
        className,
      )}
      // `.glass` kendi kenarlığını çizer (açık temada yüksek özgüllükle); gradient kenar onun yerine geçer.
      style={{ ...vars, borderColor: 'transparent', ...style }}
    >
      <Slottable>{children}</Slottable>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-70"
        style={{ ...BORDER_MASK, background: 'linear-gradient(135deg, var(--qx-glow-from), var(--qx-glow-to))' }}
      />
    </Comp>
  );
});
