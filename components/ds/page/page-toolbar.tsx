'use client';

import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { usePageCopy } from './copy';

export type PageToolbarProps = {
  /** Sol taraf: FilterBar, arama, görünüm seçici. */
  children?: ReactNode;
  /** Sağ taraf: birincil/ikincil aksiyonlar (mobilde alta iner). */
  actions?: ReactNode;
  /** Sonuç özeti ("245 kayıt") — değişince ekran okuyucuya duyurulur. */
  summary?: ReactNode;
  /** Kaydırırken üstte yapışık kalır (uzun listeler). */
  sticky?: boolean;
  ariaLabel?: string;
  className?: string;
};

/**
 * Sayfa araç çubuğu — filtreler + sonuç özeti + aksiyonlar tek satırda;
 * dar ekranda sarılır. Ops kaydı: düz yüzey, gölge yok. `role="toolbar"`
 * KULLANILMAZ (ok tuşu gezinmesi vaat eder); `role="group"` + etiket.
 */
export const PageToolbar = forwardRef<HTMLDivElement, PageToolbarProps>(function PageToolbar(
  { children, actions, summary, sticky = false, ariaLabel, className },
  ref,
) {
  const copy = usePageCopy();
  return (
    <div
      ref={ref}
      role="group"
      aria-label={ariaLabel ?? copy.toolbar}
      className={cn(
        'flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
        sticky && 'sticky top-0 z-sticky -mx-1 border-b border-subtle bg-surface-0 px-1 py-2',
        className,
      )}
    >
      {(children || summary) && (
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {children}
          {summary != null && (
            <p role="status" aria-live="polite" className="qx-small qx-num shrink-0 text-fg-muted">
              {summary}
            </p>
          )}
        </div>
      )}
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
});
