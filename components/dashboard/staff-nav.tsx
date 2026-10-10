'use client';

/** Personel paneli üst gezinmesi — kayıttaki `staff` rotalarından (Bugün · Saha bildirimi). */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navIcon } from '@/lib/navigation/icons';
import { matchActiveHref } from '@/lib/navigation/registry';
import type { ShellNode } from '@/lib/navigation/shell-config';
import { useBilingual } from './shell-context';

export function StaffNav({ nodes, homeHref }: { nodes: ShellNode[]; homeHref: string }) {
  const pathname = usePathname() ?? '';
  const bl = useBilingual();
  const items = nodes.flatMap((n) => (n.kind === 'item' ? [n.item] : n.items));
  if (items.length < 2) return null;
  const active = matchActiveHref(pathname, items.map((i) => i.href), homeHref);
  return (
    <nav aria-label={bl({ tr: 'Personel menüsü', en: 'Staff menu' })} className="border-b border-border/60">
      <ul className="flex gap-1 overflow-x-auto px-3 sm:px-4 md:px-6">
        {items.map((it) => {
          const Icon = navIcon(it.icon);
          const isActive = active === it.href;
          return (
            <li key={it.id}>
              <Link
                href={it.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {bl(it.label)}
                {isActive && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
