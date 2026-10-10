'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TocItem {
  id: string;
  label: string;
}

/**
 * Masaüstü yapışkan içindekiler + aktif bölüm (scroll-spy). Aktif öğe `aria-current="location"`
 * ile işaretlenir; vurgu yalnız renk/kenarlık geçişi (fast), sonsuz hareket yok.
 * Mobil karşılığı sunucuda `<details>` (JS gerektirmez) — bkz. `MobileToc`.
 */
export function TocNav({ items, label = 'Bu sayfada', className }: { items: readonly TocItem[]; label?: string; className?: string }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || items.length === 0) return;
    const els = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        if (visible.size) {
          // Görünenlerden belge sırasında ilk olan aktif.
          const first = items.find((i) => visible.has(i.id));
          if (first) setActive(first.id);
        }
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  if (!items.length) return null;
  return (
    <nav aria-label={label} className={cn('print:hidden', className)}>
      <p className="qx-overline mb-3 text-fg-subtle">{label}</p>
      <ol className="space-y-0.5 border-l border-border">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={isActive ? 'location' : undefined}
                className={cn(
                  '-ml-px flex min-h-9 items-center border-l-2 py-1 pl-3 pr-2 text-sm leading-snug transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  isActive ? 'border-brand font-medium text-fg' : 'border-transparent text-fg-muted hover:border-strong hover:text-fg'
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
