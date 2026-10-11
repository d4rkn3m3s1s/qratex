'use client';

import { forwardRef, isValidElement, useRef, useState, type ComponentType, type HTMLAttributes, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRegister, type Register } from './register';
import { usePlayLocale } from './locale';
import { RARITY_STYLES, normalizeRarity, type Rarity } from './rarity';
import type { PlayLocale } from './shared';

export type BadgeGlyphSize = 'sm' | 'md' | 'lg' | 'xl';

export type BadgeGlyphProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  /** Rozet adı — ekran okuyucu etiketi (zorunlu). Gizli rozette okunmaz. */
  label: string;
  /** Emoji ya da kısa metin ("🏆"). */
  emoji?: string;
  /** lucide ikon bileşeni ya da hazır düğüm. */
  icon?: ComponentType<{ className?: string; strokeWidth?: number }> | ReactNode;
  /** Görsel URL'si (öncelikli). Yüklenemezse emoji/ikon/baş harf yedeğine düşer. */
  imageSrc?: string | null;
  rarity?: Rarity | string | null;
  /** Rozetin kendi kimlik rengi (CSS rengi; ör. `hsl(var(--category-3))`). Nadirlik kenarını ezer. */
  color?: string | null;
  /** Gizli/sürpriz rozet: içerik ve ad gizlenir, "?" gösterilir. */
  secret?: boolean;
  /** Kazanılmamış: soluk + kilit işareti. */
  locked?: boolean;
  size?: BadgeGlyphSize;
  register?: Register;
  /** Dil; verilmezse uygulama dili (`AppLocaleProvider`, yoksa `tr`). */
  locale?: PlayLocale;
};

const SIZE: Record<BadgeGlyphSize, { box: string; glyph: string; icon: string; lock: string; px: number }> = {
  sm: { box: 'size-9', glyph: 'text-base', icon: 'size-4', lock: 'size-3', px: 36 },
  md: { box: 'size-12', glyph: 'text-xl', icon: 'size-5', lock: 'size-3.5', px: 48 },
  lg: { box: 'size-16', glyph: 'text-3xl', icon: 'size-7', lock: 'size-4', px: 64 },
  xl: { box: 'size-24', glyph: 'text-5xl', icon: 'size-10', lock: 'size-5', px: 96 },
};

const COPY: Record<PlayLocale, { secret: string; locked: (l: string) => string; rarity: (r: string) => string }> = {
  tr: { secret: 'Gizli rozet', locked: (l) => `${l} (henüz kazanılmadı)`, rarity: (r) => `, ${r}` },
  en: { secret: 'Secret badge', locked: (l) => `${l} (not earned yet)`, rarity: (r) => `, ${r}` },
};

function isComponent(v: unknown): v is ComponentType<{ className?: string; strokeWidth?: number }> {
  return typeof v === 'function' || (typeof v === 'object' && v !== null && '$$typeof' in v && !isValidElement(v));
}

/**
 * Rozet simgesi: görsel → ikon → emoji → baş harf sırasıyla. Kenar nadirlikten
 * (ya da rozetin kendi rengi) gelir; play kaydında gradient kenar + hale,
 * ops kaydında ince düz kenar. Gizli rozet "?" ile, kazanılmamış rozet soluk ve
 * kilitli gösterilir. Dekoratif değil: `role="img"` + etiket.
 */
export const BadgeGlyph = forwardRef<HTMLSpanElement, BadgeGlyphProps>(function BadgeGlyph(
  {
    label,
    emoji,
    icon,
    imageSrc,
    rarity,
    color,
    secret = false,
    locked = false,
    size = 'md',
    register,
    locale: localeProp,
    className,
    style,
    ...rest
  },
  ref,
) {
  const locale = usePlayLocale(localeProp);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const reg = useRegister(register, rootRef);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgFailed = !!imageSrc && failedSrc === imageSrc;
  const key = normalizeRarity(rarity);
  const r = RARITY_STYLES[key];
  const s = SIZE[size];
  const copy = COPY[locale];
  const play = reg === 'play';

  const edgeFrom = secret ? 'hsl(var(--border-strong))' : color || r.edge;
  const edgeTo = secret ? 'hsl(var(--text-3))' : color || r.edgeTo;
  const ringWidth = size === 'sm' ? 2 : 3;

  const ariaLabel = secret
    ? copy.secret
    : (locked ? copy.locked(label) : label) + (rarity ? copy.rarity(r.label[locale]) : '');

  let content: ReactNode;
  if (secret) {
    content = <span className={cn('font-display font-bold text-fg-muted', s.glyph)}>?</span>;
  } else if (imageSrc && !imgFailed) {
    content = (
      // eslint-disable-next-line @next/next/no-img-element -- rozet görselleri harici/R2; boyut sabit, optimizasyon gereksiz
      <img
        src={imageSrc}
        alt=""
        width={s.px}
        height={s.px}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailedSrc(imageSrc)}
        className="size-full rounded-full object-cover"
      />
    );
  } else if (icon != null) {
    if (isComponent(icon)) {
      const Icon = icon;
      content = <Icon className={cn(s.icon, r.text)} strokeWidth={2} />;
    } else {
      content = icon as ReactNode;
    }
  } else if (emoji) {
    content = (
      <span className={cn('leading-none', s.glyph)} aria-hidden>
        {emoji}
      </span>
    );
  } else {
    content = <span className={cn('font-bold text-fg-muted', s.glyph)}>{label.trim().charAt(0).toLocaleUpperCase(locale === 'en' ? 'en-US' : 'tr-TR') || '?'}</span>;
  }

  return (
    <span
      {...rest}
      ref={(node) => {
        rootRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      role="img"
      aria-label={ariaLabel}
      data-rarity={key}
      data-secret={secret || undefined}
      data-locked={locked || undefined}
      className={cn('relative inline-grid shrink-0 place-items-center rounded-full', s.box, className)}
      style={{
        padding: ringWidth,
        background: play ? `linear-gradient(135deg, ${edgeFrom}, ${edgeTo})` : edgeFrom,
        boxShadow:
          play && !secret && !locked && (key === 'epic' || key === 'legendary' || color)
            ? `0 0 16px -4px ${edgeFrom}`
            : undefined,
        ...style,
      }}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-full place-items-center overflow-hidden rounded-full',
          secret ? 'bg-surface-muted' : imageSrc && !imgFailed ? 'bg-white' : 'bg-surface-1',
          locked && !secret && 'opacity-50 grayscale',
        )}
        style={
          secret
            ? {
                backgroundImage:
                  'repeating-linear-gradient(135deg, hsl(var(--border-subtle) / 0.6) 0 4px, transparent 4px 9px)',
              }
            : undefined
        }
      >
        {content}
      </span>
      {locked && !secret && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-surface-elevated p-0.5 text-fg-muted ring-1 ring-border qx-elevation-1"
        >
          <Lock className={s.lock} />
        </span>
      )}
    </span>
  );
});
