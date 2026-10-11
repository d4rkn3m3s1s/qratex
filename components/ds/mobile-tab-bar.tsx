'use client';

/**
 * MobileTabBar — mobil alt sekme çubuğu (QDL kabuk grubu).
 *
 *   <MobileTabBar
 *     ariaLabel="Ana gezinme"
 *     activeId="customer.home"
 *     items={[{ id, href, label, icon }, { id, href, label, icon, fab: true }, …]}
 *   />
 *
 * - `lg` ve üstünde gizlidir (masaüstünde aynı hedefler sidebar'ın üst düzeyidir).
 * - `fab: true` öğe ortada yükseltilmiş birincil eylemdir (ör. TARA). Tek olmalı.
 * - Erişilebilirlik: `<nav>` + `aria-current="page"`, her hedef ≥ 44×44px, görünür odak
 *   halkası, ikonlar `aria-hidden` ve metin etiketi her zaman görünür (yalnız renge
 *   dayanmaz: aktif sekmede etiket kalınlaşır ve üstte gösterge çizgisi çıkar).
 * - Hareket: yalnız basma geri bildirimi (`fast`), `motion-safe` altında; döngü yok.
 * - Çubuk yüksekliği `--qx-tabbar-h` CSS değişkeniyle yayınlanır; alt kenara yapışan
 *   diğer katmanlar (toast, sohbet balonu, puan kapsülü) `bottom: calc(var(--qx-tabbar-h, 0px) + …)`
 *   ile çakışmadan konumlanır. Değişkeni çubuğu kullanan layout tanımlar (müşteri: `lg` altında
 *   `calc(4rem + safe-area)`, `lg` ve üstünde `0px`).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileTabBarItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Ortadaki vurgulu birincil eylem. */
  fab?: boolean;
  /** Sayaç (okunmamış vb.). */
  badge?: number;
}

export interface MobileTabBarProps {
  items: MobileTabBarItem[];
  activeId?: string | null;
  ariaLabel: string;
  className?: string;
}

/** Çubuğun içerik yüksekliği (güvenli alan hariç). Kapsayıcı alt boşluğu bununla hesaplanır. */
export const MOBILE_TAB_BAR_HEIGHT = '4rem';

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number', '']);

function isTextEntry(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXT_INPUT_TYPES.has(((el as HTMLInputElement).type || '').toLowerCase());
}

/**
 * Dokunmatik cihazda bir metin alanı odaktayken (yazılım klavyesi açık) true.
 * Android Chrome / Capacitor WebView'de klavye görünür alanı daraltınca sabit alt çubuk
 * odaktaki alanın üstüne biner; çubuğu bu sırada gizlemek alanı görünür tutar.
 */
function useSoftKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;
    const sync = () => setOpen(isTextEntry(document.activeElement));
    const onOut = () => window.setTimeout(sync, 0);
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', onOut);
    };
  }, []);
  return open;
}

export function MobileTabBar({ items, activeId, ariaLabel, className }: MobileTabBarProps) {
  const keyboardOpen = useSoftKeyboardOpen();
  if (items.length === 0) return null;
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'fixed inset-x-0 bottom-0 z-header lg:hidden',
        'border-t border-border/60 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80',
        'pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]',
        keyboardOpen && 'hidden',
        className
      )}
    >
      <ul className="mx-auto flex h-16 max-w-xl items-stretch justify-around px-1">
        {items.map((item) => {
          const active = item.id === activeId;
          const Icon = item.icon;
          const badge = typeof item.badge === 'number' && item.badge > 0 ? (item.badge > 99 ? '99+' : String(item.badge)) : null;

          if (item.fab) {
            return (
              <li key={item.id} className="relative flex flex-1 justify-center">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex min-w-[4.5rem] -translate-y-3 flex-col items-center gap-1 rounded-full outline-none',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30',
                      'ring-4 ring-background transition-transform duration-fast ease-standard motion-safe:group-active:scale-95'
                    )}
                  >
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <span className={cn('text-xs leading-none', active ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.id} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={badge ? `${item.label} (${badge})` : undefined}
                className={cn(
                  'group relative flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-control px-1 outline-none',
                  'transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'text-brand' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" aria-hidden />}
                <span className="relative transition-transform duration-fast motion-safe:group-active:scale-90">
                  <Icon className="h-6 w-6" aria-hidden />
                  {badge && (
                    <span className="absolute -right-2 -top-1.5 min-w-[1.125rem] rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-4 text-primary-foreground tabular-nums">
                      {badge}
                    </span>
                  )}
                </span>
                <span className={cn('max-w-full truncate text-xs leading-none', active ? 'font-semibold' : 'font-medium')}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
