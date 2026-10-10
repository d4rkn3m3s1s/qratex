import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Herkese açık sayfaların bölüm iskeleti (sunucu bileşeni). Mobilde 16px yan boşluk,
 * içerik genişliği 72rem; bölümler arası boşluk QDL `section` aralığından.
 */
export function PublicSection({
  id,
  labelledBy,
  className,
  innerClassName,
  children,
}: {
  id?: string;
  labelledBy?: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn('relative scroll-mt-24 px-4 py-14 sm:px-6 sm:py-20', className)}
    >
      <div className={cn('mx-auto w-full max-w-6xl', innerClassName)}>{children}</div>
    </section>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  sub,
  align = 'center',
  as: Tag = 'h2',
  className,
}: {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  align?: 'center' | 'start';
  as?: 'h1' | 'h2';
  className?: string;
}) {
  return (
    <div className={cn('mb-10 max-w-2xl sm:mb-12', align === 'center' ? 'mx-auto text-center' : 'text-left', className)}>
      {eyebrow ? <p className="qx-overline mb-3 text-brand">{eyebrow}</p> : null}
      <Tag id={id} className="text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
        {title}
      </Tag>
      {sub ? <p className="mt-4 text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">{sub}</p> : null}
    </div>
  );
}

/** Cam yüzeyli kart (play kaydı vurgusu; arka plan üstünde okunurluğu korur). */
export function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-card border border-subtle bg-surface-1/85 p-5 shadow-sm backdrop-blur-md sm:p-6 dark:bg-surface-1/70',
        className
      )}
    >
      {children}
    </div>
  );
}
