import Link from 'next/link';
import { Gamepad2, Medal, Swords, Target, Trophy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { playHubCopy, type PlayLocale } from './copy';

export type PlayTabKey = 'games' | 'quests' | 'tournament' | 'squads' | 'league';

const TABS: ReadonlyArray<{ key: PlayTabKey; href: string; navId: string | null; icon: LucideIcon }> = [
  { key: 'games', href: '/customer/games', navId: null, icon: Gamepad2 },
  { key: 'quests', href: '/customer/quests', navId: 'customer.quests', icon: Target },
  { key: 'tournament', href: '/customer/games?tab=tournament', navId: null, icon: Trophy },
  { key: 'squads', href: '/customer/squads', navId: 'customer.squads', icon: Swords },
  { key: 'league', href: '/customer/leaderboard', navId: 'customer.leaderboard', icon: Medal },
];

/**
 * "Oyna" alt sekme başlığı (yol haritası §4.3: Oyunlar · Görevler · Turnuva · Klan · Lig).
 * Bağlantı tabanlıdır (her sekme kendi rotası); etkin sekme `aria-current="page"`.
 * `enabledNavIds` verilirse yönetici tarafından kapatılmış modüllerin sekmesi gizlenir
 * (kabuk kaydından, `getShellConfig`). Diğer Oyna sayfaları da aynı bileşeni kullanabilir.
 */
export function PlayTabsNav({
  active,
  locale = 'tr',
  enabledNavIds,
  className,
}: {
  active: PlayTabKey;
  locale?: PlayLocale;
  enabledNavIds?: ReadonlySet<string> | null;
  className?: string;
}) {
  const c = playHubCopy(locale);
  const tabs = TABS.filter((t) => !t.navId || !enabledNavIds || enabledNavIds.has(t.navId));
  return (
    <nav aria-label={c.tabsLabel} className={cn('-mx-1 overflow-x-auto px-1 [scrollbar-width:none]', className)}>
      <ul className="flex min-w-max gap-1.5 rounded-control border border-border bg-surface-1 p-1">
        {tabs.map(({ key, href, icon: Icon }) => {
          const isActive = key === active;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                prefetch={key === 'games' || key === 'tournament' ? true : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-chip px-3.5 qx-small font-medium',
                  'transition-colors duration-fast ease-standard',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive
                    ? 'bg-brand text-brand-fg qx-elevation-1'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {c.tabs[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
