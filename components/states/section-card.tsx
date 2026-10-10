'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TONE_CHIP, TONE_STRIPE, type Tone } from './tone';

export type SectionCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Başlık satırının sağı (filtre, "Tümünü gör", menü). */
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  /** Sol kenarda ince anlam şeridi (yalnız gerektiğinde). */
  tone?: Tone;
  stripe?: boolean;
  /** `compact`: yoğun ops listeleri; `flush`: içerik kenara dayanır (tablo). */
  density?: 'default' | 'compact' | 'flush';
  /** Başlık seviyesi (sayfa h1 → bölüm h2). */
  headingLevel?: 'h2' | 'h3';
  className?: string;
  bodyClassName?: string;
};

/**
 * Bölüm kartı — ops kaydının varsayılan yüzeyi: `surface-1`, ince kenarlık,
 * elevation ≤ 1, glow yok. `section` + `aria-labelledby` ile landmark olur.
 * (Eski `PREMIUM_PANEL_CARD_BASE` + elle başlık kopyalarının yerine.)
 */
export function SectionCard({
  title,
  description,
  icon,
  actions,
  footer,
  children,
  tone = 'neutral',
  stripe = false,
  density = 'default',
  headingLevel = 'h2',
  className,
  bodyClassName,
}: SectionCardProps) {
  const headingId = useId();
  const Heading = headingLevel;
  const hasHeader = !!(title || description || actions || icon);
  const pad = density === 'compact' ? 'px-4 py-3' : 'px-card py-4 sm:py-5';

  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn('relative min-w-0 overflow-hidden rounded-card border bg-surface-1 text-fg qx-elevation-1', className)}
    >
      {stripe && <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', TONE_STRIPE[tone])} />}
      {hasHeader && (
        <header className={cn('flex flex-wrap items-start justify-between gap-3', pad, density !== 'flush' && children ? 'pb-0 sm:pb-0' : '')}>
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div aria-hidden className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-control [&_svg]:h-[1.125rem] [&_svg]:w-[1.125rem]', TONE_CHIP[tone])}>
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <Heading id={headingId} className="qx-h3 text-fg">
                  {title}
                </Heading>
              )}
              {description && <p className="qx-small mt-0.5 text-fg-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children != null && (
        <div className={cn(density === 'flush' ? (hasHeader ? 'mt-4' : '') : pad, bodyClassName)}>{children}</div>
      )}
      {footer && <footer className={cn('border-t bg-surface-muted/50', density === 'compact' ? 'px-4 py-2.5' : 'px-card py-3')}>{footer}</footer>}
    </section>
  );
}
