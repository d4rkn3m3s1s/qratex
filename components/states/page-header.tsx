'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { m as Motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeUp } from '@/lib/motion/variants';
import { useIsHydrationRender } from '@/lib/motion/use-is-hydration-render';
import { TONE_CHIP, type Tone } from './tone';

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Bağlam etiketi (ör. "Bayi paneli · Kampanyalar"). */
  eyebrow?: ReactNode;
  icon?: ReactNode;
  /** Sağdaki aksiyonlar (mobilde başlığın altına iner). */
  actions?: ReactNode;
  /** Başlık altındaki çipler/durum (ör. son güncelleme, filtre özeti). */
  meta?: ReactNode;
  /** Geri bağlantısı (detay sayfaları). */
  back?: { href: string; label: ReactNode };
  /**
   * `compact` (varsayılan): operasyon sayfaları — düz, yoğun.
   * `hero`: yalnız panel ana sayfaları — yumuşak marka zemini.
   */
  variant?: 'compact' | 'hero';
  tone?: Tone;
  /** Başlık etiketi; sayfada tek `h1` olmalı. */
  as?: 'h1' | 'h2';
  className?: string;
};

/**
 * Sayfa başlığı — mobilde DE görünür (eski `DashboardPageHeading` mobilde
 * gizliydi). Tek `h1`, isteğe bağlı eyebrow/açıklama/aksiyon/meta.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
  meta,
  back,
  variant = 'compact',
  tone = 'brand',
  as = 'h1',
  className,
}: PageHeaderProps) {
  const Heading = as;
  const hero = variant === 'hero';
  const fromServer = useIsHydrationRender();

  return (
    <Motion.header
      variants={fadeUp}
      // SSR ilk boyamada görünür (başlık çoğu panel sayfasının LCP öğesi); gezinmede animasyonlu.
      initial={fromServer ? false : 'hidden'}
      animate="visible"
      className={cn(
        'relative min-w-0',
        hero
          ? 'overflow-hidden rounded-sheet border border-brand-border/60 bg-surface-1 p-card qx-elevation-1 sm:p-6 lg:p-8'
          : 'pb-1',
        className,
      )}
    >
      {hero && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,hsl(var(--brand)/0.10),transparent_60%),radial-gradient(80%_60%_at_100%_0%,hsl(var(--gradient-to)/0.08),transparent_55%)]"
        />
      )}
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          {icon && (
            <div
              aria-hidden
              className={cn(
                'grid shrink-0 place-items-center rounded-control [&_svg]:h-5 [&_svg]:w-5',
                TONE_CHIP[tone],
                hero ? 'h-12 w-12 sm:h-14 sm:w-14 sm:[&_svg]:h-6 sm:[&_svg]:w-6' : 'h-10 w-10',
              )}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 space-y-1">
            {back && (
              <Link
                href={back.href}
                className="qx-small -ml-1 mb-1 inline-flex min-h-8 items-center gap-1 rounded-chip px-1 text-fg-muted transition-colors duration-fast hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {back.label}
              </Link>
            )}
            {eyebrow && <p className="qx-overline text-brand">{eyebrow}</p>}
            <Heading className="qx-h1 text-fg">{title}</Heading>
            {description && <p className="qx-body max-w-prose text-pretty text-fg-muted">{description}</p>}
            {meta && <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
      </div>
    </Motion.header>
  );
}
