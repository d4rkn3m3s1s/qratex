'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BellRing, HeartHandshake, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAutomationCopy } from './copy';

const ITEMS = [
  { href: '/dealer/automation/replies', key: 'replies', icon: Reply },
  { href: '/dealer/automation/remedy', key: 'remedy', icon: HeartHandshake },
  { href: '/dealer/automation/alerts', key: 'alerts', icon: BellRing },
] as const;

/** Otomasyon yüzeyinin üç bölümü arasında gezinme (gerçek bağlantılar; URL'de kalıcı). */
export function AutomationNav() {
  const pathname = usePathname() ?? '';
  const copy = useAutomationCopy();
  return (
    <nav aria-label={copy.nav.aria} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 px-1">
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  active
                    ? 'border-brand/40 bg-brand-subtle text-fg'
                    : 'border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {copy.nav[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
