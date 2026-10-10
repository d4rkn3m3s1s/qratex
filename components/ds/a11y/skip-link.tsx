'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useA11yCopy } from './copy';

export type SkipLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  /** Atlanacak hedefin id'si (varsayılan `main-content`). Hedef `<main id="main-content">` olmalı. */
  targetId?: string;
  children?: React.ReactNode;
};

/**
 * "Ana içeriğe atla" bağlantısı — sayfanın İLK odaklanabilir öğesi olmalı (kabuğun en üstü).
 * Odak gelene kadar görünmez; odakta güvenli alan içinde sol üstte belirir.
 * Tıklanınca hedefe gerçekten odak taşır (yalnız kaydırmaz): hedef odaklanamıyorsa
 * geçici `tabindex="-1"` verilir.
 */
export const SkipLink = React.forwardRef<HTMLAnchorElement, SkipLinkProps>(
  ({ targetId = 'main-content', className, children, onClick, ...props }, ref) => {
    const copy = useA11yCopy();
    const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      event.preventDefault();
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
      target.focus({ preventScroll: false });
      target.scrollIntoView({ block: 'start' });
      try {
        history.replaceState(null, '', `#${targetId}`);
      } catch {
        /* sandbox'lı ortam — yok say */
      }
    };

    return (
      <a
        ref={ref}
        href={`#${targetId}`}
        onClick={handleClick}
        className={cn(
          'sr-only',
          'focus:not-sr-only focus:fixed focus:z-skip',
          'focus:left-[max(1rem,env(safe-area-inset-left))] focus:top-[max(1rem,env(safe-area-inset-top))]',
          'focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-control focus:border focus:border-strong',
          'focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-fg focus:qx-elevation-3 qx-body font-medium',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
        {...props}
      >
        {children ?? copy.skipToContent}
      </a>
    );
  },
);
SkipLink.displayName = 'SkipLink';
