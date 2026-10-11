import Link from 'next/link';
import { Inbox, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * İletişim yüzeyinin iki ucu arasında yerel geçiş (giden şablonlar ↔ gelen yanıtlar).
 * Global navigasyon DEĞİL; yalnız bu iki sayfanın içinde durur (denetim "Çakışmalar" önerisi).
 */
export function CommTabs({ active, unread }: { active: 'inbox' | 'templates'; unread?: number }) {
  const items = [
    { key: 'inbox' as const, href: '/admin/inbox', label: 'Gelen kutusu', icon: Inbox, badge: unread },
    { key: 'templates' as const, href: '/admin/intern-emails', label: 'Mail şablonları', icon: Send, badge: undefined },
  ];
  return (
    <nav aria-label="İletişim bölümleri" className="flex gap-1 rounded-control border border-border bg-surface-1 p-1">
      {items.map((it) => {
        const Icon = it.icon;
        const on = it.key === active;
        return (
          <Link
            key={it.key}
            href={it.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-chip px-3 text-sm font-medium transition-colors duration-fast sm:flex-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              on ? 'bg-brand-subtle text-brand' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {it.label}
            {typeof it.badge === 'number' && it.badge > 0 && (
              <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-5 text-brand-fg tabular-nums">
                {it.badge > 99 ? '99+' : it.badge}
                <span className="sr-only"> okunmamış</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
