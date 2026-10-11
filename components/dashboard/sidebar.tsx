'use client';

/**
 * Panel sidebar'ı — menü `lib/navigation/registry.ts`'ten SUNUCUDA çözülür
 * (`getShellConfig`) ve `ShellProvider` ile gelir; burada istemci ağ isteği yalnız
 * sayaç rozeti içindir (B8). Masaüstünde sol menü; bayi/admin'de mobilde başlıktaki
 * menü düğmesiyle açılan çekmece. Müşteri mobilde alt sekme çubuğunu kullanır.
 *
 * Erişilebilirlik (B10): aktif öğe `aria-current="page"`, daraltılmış modda her
 * bağlantının adı (`aria-label` + ipucu), grup/alt liste düğmeleri `aria-expanded`,
 * çıkış düğmesi etiketli, dokunma hedefleri ≥ 44px. Aktif öğe en uzun önek
 * eşleşmesiyle seçilir (B12.1). İçerik bileşeni modül düzeyinde (B7: her render'da
 * yeniden kurulmaz, kaydırma konumu korunur).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { ChevronDown, ChevronLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getInitials } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';
import { navIcon } from '@/lib/navigation/icons';
import { matchActiveHref, type NavBadgeKey } from '@/lib/navigation/registry';
import type { ShellConfig, ShellItem, ShellNode } from '@/lib/navigation/shell-config';
import { useBilingual, useCanSeeTeam, useShell } from './shell-context';

// Geriye uyum: eski admin menü ekranları bu dışa aktarımları kullanıyor
// (Navigasyon Stüdyosu `/admin/navigation` gelince emekli olurlar).
export {
  adminNavItems,
  dealerNavItems,
  customerNavItems,
  getNavOrderId,
  getNavGroups,
  type NavItem,
  type NavGroup,
} from '@/lib/navigation/legacy-nav';

interface SidebarProps {
  /** Eski imza; menü artık `ShellProvider`'daki kabuk yapılandırmasından gelir. */
  role?: 'ADMIN' | 'DEALER' | 'CUSTOMER';
  /** Admin SEO’dan gelen site adı */
  siteName?: string;
}

type Badges = Partial<Record<NavBadgeKey, number>>;

function collectHrefs(nodes: ShellNode[]): string[] {
  const out: string[] = [];
  const walk = (it: ShellItem) => {
    out.push(it.href);
    it.children.forEach(walk);
  };
  for (const n of nodes) {
    if (n.kind === 'item') walk(n.item);
    else n.items.forEach(walk);
  }
  return out;
}

function filterTeam(nodes: ShellNode[], canSeeTeam: boolean): ShellNode[] {
  if (canSeeTeam) return nodes;
  const keep = (it: ShellItem): ShellItem | null =>
    it.teamOnly ? null : { ...it, children: it.children.map(keep).filter((c): c is ShellItem => c != null) };
  return nodes
    .map((n): ShellNode | null => {
      if (n.kind === 'item') {
        const item = keep(n.item);
        return item ? { kind: 'item', item } : null;
      }
      const items = n.items.map(keep).filter((c): c is ShellItem => c != null);
      return items.length ? { ...n, items } : null;
    })
    .filter((n): n is ShellNode => n != null);
}

function containsHref(it: ShellItem, href: string | null): boolean {
  if (!href) return false;
  return it.href === href || it.children.some((c) => containsHref(c, href));
}

function useBadges(shell: ShellConfig | undefined): Badges {
  const [badges, setBadges] = useState<Badges>({});
  const needsDealerInbox = useMemo(() => {
    if (!shell) return false;
    const has = (it: ShellItem): boolean => it.badge === 'dealerInbox' || it.children.some(has);
    return shell.nodes.some((n) => (n.kind === 'item' ? has(n.item) : n.items.some(has)));
  }, [shell]);

  useEffect(() => {
    if (!needsDealerInbox) return;
    let cancelled = false;
    fetch('/api/dealer/notification-badges', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { badgeCount?: unknown } | null) => {
        if (cancelled || !data || typeof data.badgeCount !== 'number') return;
        setBadges((b) => ({ ...b, dealerInbox: data.badgeCount as number }));
      })
      .catch((err) => console.warn('[Sidebar] sayaç alınamadı:', err));
    return () => {
      cancelled = true;
    };
  }, [needsDealerInbox]);

  return badges;
}

function BadgeCount({ value, active, floating }: { value: number; active?: boolean; floating?: boolean }) {
  const text = value > 99 ? '99+' : String(value);
  return (
    <span
      className={cn(
        'min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums',
        floating && 'absolute -right-1 -top-1 px-1 text-[11px] leading-4',
        active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary text-primary-foreground'
      )}
    >
      {text}
    </span>
  );
}

interface NavLinkProps {
  item: ShellItem;
  activeHref: string | null;
  showLabels: boolean;
  nested?: boolean;
  badges: Badges;
  onNavigate?: () => void;
  label: (it: ShellItem) => string;
  expandLabel: string;
  collapseLabel: string;
}

function NavLink({ item, activeHref, showLabels, nested, badges, onNavigate, label, expandLabel, collapseLabel }: NavLinkProps) {
  const isActive = activeHref === item.href;
  const hasActiveChild = !isActive && containsHref(item, activeHref);
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const expanded = item.children.length > 0 && (manualOpen ?? (isActive || hasActiveChild));
  const Icon = navIcon(item.icon);
  const text = label(item);
  const badgeNum = item.badge ? badges[item.badge] : undefined;
  const showBadge = typeof badgeNum === 'number' && badgeNum > 0;
  const ariaLabel = showBadge ? `${text} (${badgeNum})` : text;

  const link = (
    <Link
      prefetch={false}
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      aria-label={showLabels ? (showBadge ? ariaLabel : undefined) : ariaLabel}
      className={cn(
        'group relative flex min-h-11 flex-1 cursor-pointer touch-manipulation items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors duration-fast ease-standard',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        !showLabels && 'justify-center px-0',
        isActive
          ? 'bg-primary font-medium text-primary-foreground'
          : hasActiveChild
            ? 'font-medium text-foreground hover:bg-accent/70'
            : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      {showLabels && <span className="flex-1 truncate">{text}</span>}
      {showLabels && showBadge && <BadgeCount value={badgeNum as number} active={isActive} />}
      {!showLabels && showBadge && <BadgeCount value={badgeNum as number} active={isActive} floating />}
    </Link>
  );

  return (
    <li className={cn(nested && showLabels && 'ml-4 border-l border-border/50 pl-2')}>
      <div className="flex items-center gap-1">
        {showLabels ? (
          link
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{ariaLabel}</TooltipContent>
          </Tooltip>
        )}
        {showLabels && item.children.length > 0 && (
          <button
            type="button"
            onClick={() => setManualOpen(!expanded)}
            aria-expanded={expanded}
            aria-label={`${text}: ${expanded ? collapseLabel : expandLabel}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors duration-fast hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-fast', expanded && 'rotate-180')} aria-hidden />
          </button>
        )}
      </div>
      {expanded && showLabels && (
        <ul className="mt-1 space-y-1">
          {item.children.map((child) => (
            <NavLink
              key={child.id}
              item={child}
              activeHref={activeHref}
              showLabels={showLabels}
              nested
              badges={badges}
              onNavigate={onNavigate}
              label={label}
              expandLabel={expandLabel}
              collapseLabel={collapseLabel}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface SidebarContentProps {
  nodes: ShellNode[];
  activeHref: string | null;
  collapsed: boolean;
  mobile: boolean;
  badges: Badges;
  siteName: string;
  role: ShellConfig['role'];
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}

function SidebarContent({ nodes, activeHref, collapsed, mobile, badges, siteName, role, onToggleCollapse, onNavigate }: SidebarContentProps) {
  const t = useAppT();
  const bl = useBilingual();
  const { data: session } = useSession();
  const showLabels = !collapsed || mobile;
  const label = (it: ShellItem) => bl(it.label);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set());
  const [openedGroups, setOpenedGroups] = useState<Set<string>>(() => new Set());
  const expandLabel = t('appShell.sidebarExpand');
  const collapseLabel = t('appShell.sidebarCollapse');

  const toggleGroup = (id: string, isOpen: boolean) => {
    if (isOpen) {
      setClosedGroups((s) => new Set(s).add(id));
      setOpenedGroups((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    } else {
      setOpenedGroups((s) => new Set(s).add(id));
      setClosedGroups((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  const linkProps = { activeHref, showLabels, badges, onNavigate, label, expandLabel, collapseLabel };

  return (
    <div className={cn('flex h-full flex-col', mobile ? 'w-full' : collapsed ? 'w-[72px]' : 'w-72')}>
      {/* Üst çizgi yüksekliği DashboardHeader ile aynı */}
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-1.5 border-b border-border/60 px-2 py-2 sm:min-h-16 sm:gap-2 sm:px-3 sm:py-0">
        <Link
          prefetch={false}
          href="/"
          aria-label={siteName}
          className="flex h-12 min-h-0 min-w-0 flex-1 items-center gap-2 rounded-lg outline-none ring-offset-background transition-opacity duration-fast hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring sm:h-16 sm:gap-2.5"
        >
          <Image src="/logo/logo.png" alt="" width={64} height={64} priority className="hidden h-10 w-10 shrink-0 object-contain dark:block sm:h-12 sm:w-12" />
          <Image src="/logo/logo-light.png" alt="" width={64} height={64} priority className="block h-10 w-10 shrink-0 object-contain dark:hidden sm:h-12 sm:w-12" />
          {showLabels && (
            <span className="flex min-h-0 min-w-0 flex-1 items-center self-stretch">
              <Image
                src="/logo/font.png"
                alt=""
                width={180}
                height={52}
                priority
                sizes="(min-width: 1024px) 240px, 180px"
                className="hidden max-h-10 w-auto max-w-full object-contain object-left dark:block sm:max-h-12"
              />
              <Image
                src="/logo/font-light.png"
                alt=""
                width={180}
                height={52}
                priority
                sizes="(min-width: 1024px) 240px, 180px"
                className="block max-h-10 w-auto max-w-full object-contain object-left dark:hidden sm:max-h-12"
              />
            </span>
          )}
        </Link>
        {!mobile && onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={onToggleCollapse}
            className="hidden h-11 w-11 shrink-0 touch-manipulation lg:flex"
            aria-label={collapsed ? t('appShell.sidebarExpand') : t('appShell.sidebarCollapse')}
            aria-expanded={!collapsed}
          >
            <ChevronLeft aria-hidden className={cn('h-4 w-4 transition-transform duration-fast', collapsed && 'rotate-180')} />
          </Button>
        )}
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto p-3" aria-label={t('appShell.sidebarAppMenu')}>
        <ul className="space-y-1">
          {nodes.map((node) => {
            if (node.kind === 'item') return <NavLink key={node.item.id} item={node.item} {...linkProps} />;

            const hasActive = node.items.some((it) => containsHref(it, activeHref));
            const isOpen = closedGroups.has(node.id) ? false : openedGroups.has(node.id) || hasActive;
            const GroupIcon = navIcon(node.icon);
            const groupLabel = bl(node.label);

            if (!showLabels) {
              return (
                <li key={`group-${node.id}`} className="space-y-1 border-t border-border/40 pt-1 first:border-t-0 first:pt-0">
                  <span className="sr-only">{groupLabel}</span>
                  <ul className="space-y-1">
                    {node.items.map((it) => (
                      <NavLink key={it.id} item={it} {...linkProps} />
                    ))}
                  </ul>
                </li>
              );
            }

            const listId = `nav-group-${node.id}`;
            return (
              <li key={`group-${node.id}`} className="pt-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(node.id, isOpen)}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors duration-fast',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    hasActive ? 'text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  )}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1 text-left">{groupLabel}</span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-fast', isOpen && 'rotate-180')} aria-hidden />
                </button>
                {isOpen && (
                  <ul id={listId} className="mt-1 space-y-1">
                    {node.items.map((it) => (
                      <NavLink key={it.id} item={it} {...linkProps} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <Separator />

      <div className="p-3">
        {role === 'customer' && showLabels && (
          <div className="mb-3 rounded-card border border-border/50 bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {t('appShell.level')} {session?.user?.level || 1}
              </span>
              {/* Harcanabilir PUAN bakiyesi (XP değil). Eskiden "{puan} XP" yazıp seviye çubuğunu puan
                  bakiyesinden hesaplıyordu — seviye XP'den türediği için çubuk uydurmaydı; gerçek seviye
                  ilerlemesi Ben → İlerleme'de (XP, aynı eğri). */}
              <span className="text-xs tabular-nums text-muted-foreground">
                {(session?.user?.points || 0).toLocaleString(bl({ tr: 'tr-TR', en: 'en-US' }))} {t('appShell.globalSearchPointsShort')}
              </span>
            </div>
          </div>
        )}

        <div className={cn('flex items-center gap-3', !showLabels && 'flex-col')}>
          <Avatar>
            <AvatarImage src={session?.user?.image || ''} alt="" />
            <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
              {getInitials(session?.user?.name)}
            </AvatarFallback>
          </Avatar>
          {showLabels && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{session?.user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{session?.user?.email}</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => signOut({ callbackUrl: '/auth/login', redirect: true })}
            className="h-11 w-11 text-muted-foreground hover:text-destructive"
            aria-label={t('appShell.logout')}
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

const COLLAPSE_KEY = 'qratex-sidebar-collapsed';

export function Sidebar({ siteName = 'QRateX' }: SidebarProps) {
  const t = useAppT();
  const pathname = usePathname() ?? '';
  const ctx = useShell();
  const canSeeTeam = useCanSeeTeam();
  const [collapsed, setCollapsed] = useState(false);
  const badges = useBadges(ctx?.shell);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* depolama kapalı: varsayılan açık */
    }
  }, []);

  const nodes = useMemo(() => filterTeam(ctx?.shell.nodes ?? [], canSeeTeam), [ctx?.shell.nodes, canSeeTeam]);
  const activeHref = useMemo(
    () => matchActiveHref(pathname, collectHrefs(nodes), ctx?.shell.homeHref),
    [pathname, nodes, ctx?.shell.homeHref]
  );

  if (!ctx) return null;
  const { shell, navOpen, setNavOpen } = ctx;

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* yok say */
      }
      return next;
    });
  };

  const common = { nodes, activeHref, badges, siteName, role: shell.role };

  return (
    <>
      <aside
        aria-label={t('appShell.sidebarPanelMenu')}
        className={cn(
          'app-sidebar-surface hidden shrink-0 flex-col border-r border-border/60 backdrop-blur-md transition-[width] duration-base ease-standard lg:flex',
          collapsed ? 'w-[72px]' : 'w-72'
        )}
      >
        <SidebarContent {...common} collapsed={collapsed} mobile={false} onToggleCollapse={toggleCollapse} />
      </aside>

      {/* Mobil çekmece: bayi/admin başlıktaki menü düğmesiyle açılır. Müşteride alt sekme çubuğu var. */}
      {shell.role !== 'customer' && (
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-[min(20rem,85vw)] max-w-sm p-0">
            <SheetTitle className="sr-only">{t('appShell.sidebarPanelMenu')}</SheetTitle>
            <SheetDescription className="sr-only">{t('appShell.sidebarAppMenu')}</SheetDescription>
            <SidebarContent {...common} collapsed={false} mobile onNavigate={() => setNavOpen(false)} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
