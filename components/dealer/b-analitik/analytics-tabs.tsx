'use client';

/**
 * Analitik sekme çubuğu — rota tabanlı (her sekme ayrı URL). Sekme listesi sunucuda kabuk
 * yapılandırmasından gelir (modülü kapalı sekme görünmez). Dönem ve şube bağlamı sekmeler
 * arasında korunur (`?period=…&location=…`). Yatay kayar, dokunma hedefi ≥ 44px, etkin sekme
 * `aria-current="page"`.
 */
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { navIcon } from '@/lib/navigation/icons';
import { cn } from '@/lib/utils';
import { activeAnalyticsTab, withAnalyticsContext, type AnalyticsTab } from '@/lib/dealer-analytics/tabs';
import { useAnalyticsLocale } from './copy';

export function AnalyticsTabs({ tabs, ariaLabel }: { tabs: readonly AnalyticsTab[]; ariaLabel: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const locale = useAnalyticsLocale();
  const active = activeAnalyticsTab(tabs, pathname);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const el = activeRef.current;
    const scroller = el?.closest('[data-analytics-tabs-scroller]') as HTMLElement | null;
    if (!el || !scroller) return;
    const left = el.offsetLeft - scroller.clientWidth / 2 + el.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: 'auto' });
  }, [active]);

  if (tabs.length < 2) return null;

  return (
    <nav aria-label={ariaLabel} className="min-w-0">
      <div data-analytics-tabs-scroller className="-mx-1 overflow-x-auto border-b border-subtle px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex w-max min-w-full items-stretch gap-1">
          {tabs.map((tab) => {
            const Icon = navIcon(tab.icon);
            const isActive = tab.id === active;
            return (
              <li key={tab.id} className="flex">
                <Link
                  ref={isActive ? activeRef : undefined}
                  href={withAnalyticsContext(tab.href, sp)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'qx-small relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-t-chip px-3 font-medium',
                    'text-fg-muted transition-colors duration-fast ease-standard hover:text-fg',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
                    'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors after:duration-fast',
                    isActive && 'text-fg after:bg-brand',
                  )}
                >
                  <Icon aria-hidden className="h-4 w-4 shrink-0" />
                  <span>{locale === 'en' ? tab.label.en : tab.label.tr}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
