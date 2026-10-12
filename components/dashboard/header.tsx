'use client';

/**
 * Panel başlığı — kabuk eylemleri: menü düğmesi (bayi/admin mobil), ⌘K komut paleti
 * (sayfalar + kısayollar + veriler), tema/dil, bildirimler ve hesap menüsü.
 * Bayi: kalıcı "Tara" (kasa) düğmesi + ⌘J AI asistan çekmecesi.
 * Müşteri: avatar → Ben (profil menüsü), ayarlar Ben → Ayarlar'da.
 *
 * Menü ve palet hedefleri `ShellProvider`'daki kayıt-türevli kabuk yapılandırmasından
 * gelir; ayrı bir istemci isteği yoktur. Palette yalnız veri araması (`/api/search`)
 * sorgu yazıldıkça istenir.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { signOut } from '@/lib/native/sign-out';
import {
  Search,
  Settings,
  User,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Loader2,
  Menu,
  ScanLine,
  Bot,
  FileText,
  QrCode,
  Package,
  Users,
  Store,
  CreditCard,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getInitials } from '@/lib/utils';
import { safeLocalStorageSetItem } from '@/lib/safe-web-storage';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { UserAvatarFrame } from '@/components/ui/avatar-frame';
import type { CommandPaletteItem } from '@/components/ds/command-palette';
import { navIcon } from '@/lib/navigation/icons';
import { matchActiveHref } from '@/lib/navigation/registry';
import { trackNav } from '@/lib/navigation/track';
import { useBilingual, useCanSeeTeam, useShell } from './shell-context';

function NotificationCenterSkeleton() {
  const t = useAppT();
  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      className="relative h-11 min-h-11 min-w-11 w-11 shrink-0 touch-manipulation rounded-full transition-colors duration-base hover:bg-muted"
      disabled
      aria-label={t('notificationCenter.trigger')}
    >
      <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin opacity-50" aria-hidden />
    </Button>
  );
}

const NotificationCenter = dynamic(
  () => import('./notification-center').then((m) => m.NotificationCenter),
  {
    loading: () => <NotificationCenterSkeleton />,
    ssr: false,
  },
);

// ⌘K komut paleti — ilk açılışta yüklenir (kabuğun ilk yük JS'inden çıkar; LCP/TBT).
const CommandPalette = dynamic(() => import('@/components/ds/command-palette').then((m) => m.CommandPalette), {
  ssr: false,
});

// ⌘J asistan çekmecesi — b-asistan yüzeyinin bileşeni; yalnız açılınca yüklenir.
const AssistantDrawer = dynamic(() => import('@/components/dealer/assistant-drawer').then((m) => m.AssistantDrawer), {
  ssr: false,
});

interface DashboardHeaderProps {
  title?: string;
  description?: string;
  /** Komut paletini (⌘K) göster. */
  showSearch?: boolean;
  actions?: React.ReactNode;
}

interface SearchApiResults {
  users: { id: string; name: string | null; email: string; businessName: string | null; role: string; href: string }[];
  feedbacks: { id: string; text: string | null; rating: number; sentiment: string | null; createdAt: string; href: string }[];
  products: { id: string; name: string; categoryName?: string; href: string }[];
  qrCodes: { id: string; name: string; code: string; businessName: string | null; href: string }[];
  cards?: { id: string; token: string; status: string; customerName: string | null; href: string }[];
}

/** Son ziyaret edilen kayıt sayfaları (rol başına, en çok 5) — yalnız bu tarayıcıda; ⌘K boşken üstte. */
const RECENT_LIMIT = 5;
const recentKey = (role: string) => `qx:nav-recent:${role}`;

function readRecent(role: string): string[] {
  try {
    const raw = window.localStorage.getItem(recentKey(role));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeRecent(role: string, ids: string[]): void {
  try {
    window.localStorage.setItem(recentKey(role), JSON.stringify(ids.slice(0, RECENT_LIMIT)));
  } catch {
    /* özel pencere / engellenmiş depolama: yalnız bu oturumda bellekte kalır */
  }
}

const isMacLike = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function DashboardHeader({ title, description, showSearch = true, actions }: DashboardHeaderProps) {
  const t = useAppT();
  const bl = useBilingual();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { data: session } = useSession();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const ctx = useShell();
  const canSeeTeam = useCanSeeTeam();
  const shell = ctx?.shell;
  const role = shell?.role;
  const { locale, setLocale } = useAppLocale();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const forceModeDom = (mode: 'light' | 'dark' | 'system') => {
    const resolved =
      mode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme = resolved;
    if (body) {
      body.classList.remove('light', 'dark');
      body.classList.add(resolved);
      body.setAttribute('data-theme', resolved);
      body.style.colorScheme = resolved;
    }
  };
  const applyThemeSelection = (mode: 'light' | 'dark' | 'system') => {
    safeLocalStorageSetItem('qratex-theme', mode);
    safeLocalStorageSetItem('theme', mode);
    forceModeDom(mode);
    setTheme(mode);
  };
  // Palet eylemi her zaman güncel temayı okusun (liste memo'lu).
  const themeRef = useRef({ resolvedTheme, apply: applyThemeSelection });
  useEffect(() => {
    themeRef.current = { resolvedTheme, apply: applyThemeSelection };
  });

  const handleSignOut = async () => {
    try {
      await signOut({ redirect: false });
      router.push('/auth/login');
      router.refresh();
    } catch {
      window.location.href = '/auth/login';
    }
  };

  const settingsHref = shell?.links.settings ?? '/';
  const meHref = shell?.links.me;
  const scanHref = role === 'dealer' ? shell?.links.scan : undefined;
  const assistantHref = role === 'dealer' ? shell?.links.assistant : undefined;

  const paletteOpen = ctx?.paletteOpen ?? false;
  const setPaletteOpen = useMemo(() => ctx?.setPaletteOpen ?? (() => {}), [ctx?.setPaletteOpen]);
  const setAssistantOpen = ctx?.setAssistantOpen;
  // Çekmece ilk açılışta yüklenir, sonra bağlı kalır (sohbet durumu kapatınca kaybolmasın).
  const [assistantLoaded, setAssistantLoaded] = useState(false);
  useEffect(() => {
    if (ctx?.assistantOpen) setAssistantLoaded(true);
  }, [ctx?.assistantOpen]);
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  useEffect(() => {
    if (paletteOpen) setPaletteLoaded(true);
  }, [paletteOpen]);

  // ⌘K / Ctrl+K: palet; ⌘J / Ctrl+J: bayi asistan çekmecesi.
  useEffect(() => {
    if (!ctx) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'k' && showSearch) {
        e.preventDefault();
        ctx.setPaletteOpen(!ctx.paletteOpen);
      } else if (key === 'j' && assistantHref) {
        e.preventDefault();
        ctx.setAssistantOpen(!ctx.assistantOpen);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ctx, showSearch, assistantHref]);

  const sections = useMemo(
    () => ({
      recent: bl({ tr: 'Son kullanılanlar', en: 'Recent' }),
      shortcuts: bl({ tr: 'Kısayollar', en: 'Shortcuts' }),
      pages: bl({ tr: 'Sayfalar', en: 'Pages' }),
    }),
    [bl]
  );

  // Son kullanılanlar: gezilen yol kayıttaki bir palet sayfasına çözülürse listenin başına alınır.
  const [recentIds, setRecentIds] = useState<string[]>([]);
  useEffect(() => {
    if (!shell || !role) return;
    const entries = shell.palette.filter((p) => !p.teamOnly || canSeeTeam);
    const byHref = new Map(entries.map((p) => [p.href.split('?')[0], p.id]));
    const hit = matchActiveHref(pathname, [...byHref.keys()], shell.homeHref);
    const prev = readRecent(role);
    const id = hit ? byHref.get(hit) : undefined;
    const next = id ? [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_LIMIT) : prev;
    if (id && next.join() !== prev.join()) writeRecent(role, next);
    setRecentIds(next);
  }, [pathname, shell, role, canSeeTeam]);

  const paletteItems: CommandPaletteItem[] = useMemo(() => {
    if (!shell) return [];
    const shortcutItems: CommandPaletteItem[] = shell.shortcuts.map((sc) => ({
      id: sc.id,
      label: bl(sc.label),
      section: sections.shortcuts,
      icon: navIcon(sc.icon),
      hint: sc.hint,
      keywords: sc.keywords,
      onSelect: () => {
        if (sc.href) {
          trackNav('shortcut', sc.href, sc.id);
          router.push(sc.href);
        }
        else if (sc.action === 'open-assistant') setAssistantOpen?.(true);
        else if (sc.action === 'toggle-theme') themeRef.current.apply(themeRef.current.resolvedTheme === 'dark' ? 'light' : 'dark');
      },
    }));
    const pageItems: CommandPaletteItem[] = shell.palette
      .filter((p) => !p.teamOnly || canSeeTeam)
      .map((p) => ({
        id: p.id,
        label: bl(p.label),
        section: sections.pages,
        context: p.section ? bl(p.section) : undefined,
        icon: navIcon(p.icon),
        keywords: p.keywords,
        onSelect: () => {
          trackNav('palette', p.href, p.id);
          router.push(p.href);
        },
      }));
    // Son kullanılanlar (yalnız sorgu boşken, şu anki sayfa hariç) — sayfa öğesinin kopyası.
    const current = matchActiveHref(pathname, shell.palette.map((p) => p.href.split('?')[0]), shell.homeHref);
    const recentItems: CommandPaletteItem[] = recentIds.flatMap((id) => {
      const page = pageItems.find((it) => it.id === id);
      const entry = shell.palette.find((p) => p.id === id);
      if (!page || !entry || entry.href.split('?')[0] === current) return [];
      return [
        {
          ...page,
          id: `recent-${id}`,
          section: sections.recent,
          idleOnly: true,
          onSelect: () => {
            trackNav('recent', entry.href, entry.id);
            router.push(entry.href);
          },
        },
      ];
    });
    return [...recentItems, ...shortcutItems, ...pageItems];
  }, [shell, bl, sections, router, canSeeTeam, setAssistantOpen, recentIds, pathname]);

  const searchData = useCallback(
    async (q: string, signal: AbortSignal): Promise<CommandPaletteItem[]> => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal, cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as { success?: boolean; results?: SearchApiResults } | null;
      if (!res.ok || !data?.success || !data.results) throw new Error('search_failed');
      const r = data.results;
      const go = (href: string) => () => router.push(href);
      return [
        ...r.users.map((u) => ({
          id: `u-${u.id}`,
          label: u.businessName || u.name || u.email,
          context: u.email,
          // Bayiler ayrı grup: admin "kimi arıyorum" sorusuna rol ile değil bölümle yanıt alır.
          section: u.role === 'DEALER' ? bl({ tr: 'Bayiler', en: 'Dealers' }) : t('appShell.globalSearchSectionUsers'),
          icon: u.role === 'DEALER' ? Store : Users,
          onSelect: go(u.href),
        })),
        ...r.feedbacks.map((f) => ({
          id: `f-${f.id}`,
          label: (f.text || '—').slice(0, 90),
          context: `${f.rating}★`,
          section: t('appShell.globalSearchSectionFeedbacks'),
          icon: FileText,
          onSelect: go(f.href),
        })),
        ...r.products.map((p) => ({
          id: `p-${p.id}`,
          label: p.name,
          context: p.categoryName,
          section: t('appShell.globalSearchSectionProducts'),
          icon: Package,
          onSelect: go(p.href),
        })),
        ...r.qrCodes.map((c) => ({
          id: `q-${c.id}`,
          label: c.name,
          context: c.code,
          section: t('appShell.globalSearchSectionQrCodes'),
          icon: QrCode,
          onSelect: go(c.href),
        })),
        ...(r.cards ?? []).map((c) => ({
          id: `c-${c.id}`,
          label: c.token,
          context: c.customerName ?? c.status,
          section: bl({ tr: 'Kartlar', en: 'Cards' }),
          icon: CreditCard,
          onSelect: go(c.href),
        })),
      ];
    },
    [router, t, bl]
  );

  const paletteCopy = useMemo(
    () => ({
      title: bl({ tr: 'Komut paleti', en: 'Command palette' }),
      placeholder: bl({ tr: 'Sayfa, kayıt ya da eylem ara…', en: 'Search pages, records or actions…' }),
      empty: t('appShell.noResults'),
      loading: t('appShell.searching'),
      error: bl({ tr: 'Arama şu an yapılamadı. Biraz sonra tekrar dene.', en: 'Search is unavailable right now. Try again shortly.' }),
      resultsCount: bl({ tr: '{count} sonuç', en: '{count} results' }),
      close: bl({ tr: 'Kapat', en: 'Close' }),
    }),
    [bl, t]
  );

  const modKey = isMacLike() ? '⌘' : 'Ctrl';

  return (
    <header className="sticky top-0 z-40 -ml-[max(0.75rem,env(safe-area-inset-left,0px))] -mr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:-mx-4 lg:-mx-6 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:pl-4 sm:pr-4 lg:pl-6 lg:pr-6 py-2 sm:py-0 border-b border-border/60 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75 supports-[padding:env(safe-area-inset-top)]:pt-[env(safe-area-inset-top)] mb-3 sm:mb-4 min-h-14 sm:min-h-16">
      <div className="flex min-h-[3.25rem] sm:h-16 items-center justify-between gap-2">
        {/* Sol — menü + başlık + palet tetikleyici */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          {ctx && role && role !== 'customer' && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => ctx.setNavOpen(true)}
              className="h-11 w-11 shrink-0 touch-manipulation lg:hidden"
              aria-label={t('appShell.openMenu')}
              aria-expanded={ctx.navOpen}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </Button>
          )}
          {title && (
            <div className="hidden shrink-0 sm:block">
              <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
              {description && <p className="truncate text-xs text-muted-foreground sm:text-sm">{description}</p>}
            </div>
          )}
          {showSearch && ctx && (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-haspopup="dialog"
              aria-keyshortcuts="Control+K Meta+K"
              className="hidden h-10 min-w-0 max-w-md flex-1 items-center gap-2 rounded-control border border-transparent bg-muted/60 px-3 text-left text-sm text-muted-foreground transition-colors duration-fast hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1 truncate">{paletteCopy.placeholder}</span>
              <kbd className="hidden select-none rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[11px] lg:inline">
                {modKey} K
              </kbd>
            </button>
          )}
        </div>

        {/* Sağ — eylemler */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {actions}

          {scanHref && (
            <Button asChild size="sm" className="h-11 min-w-11 gap-2 px-3 sm:h-10">
              <Link href={scanHref} aria-label={bl({ tr: 'Kasa: kart tara', en: 'Checkout: scan card' })}>
                <ScanLine className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">{bl({ tr: 'Tara', en: 'Scan' })}</span>
              </Link>
            </Button>
          )}
          {assistantHref && ctx && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => ctx.setAssistantOpen(true)}
              className="h-11 w-11 rounded-full"
              aria-label={bl({ tr: `AI asistanı aç (${modKey}+J)`, en: `Open AI assistant (${modKey}+J)` })}
              aria-keyshortcuts="Control+J Meta+J"
              aria-haspopup="dialog"
            >
              <Bot className="h-5 w-5" aria-hidden />
            </Button>
          )}

          {showSearch && ctx && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setPaletteOpen(true)}
              className="h-11 w-11 shrink-0 touch-manipulation sm:hidden"
              aria-label={t('appShell.search')}
              aria-haspopup="dialog"
            >
              <Search className="h-[18px] w-[18px]" aria-hidden />
            </Button>
          )}

          <LanguageSwitcher className="hidden h-10 w-10 min-h-10 min-w-10 rounded-full sm:inline-flex sm:h-9 sm:min-h-9 sm:w-9 sm:min-w-9" />

          {/* Tema: Sistem / Açık / Koyu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-10 w-10 min-h-10 min-w-10 touch-manipulation rounded-full transition-colors duration-base hover:bg-muted sm:inline-flex sm:h-9 sm:min-h-9 sm:w-9 sm:min-w-9"
                aria-label={t('appShell.themeSelect')}
              >
                {!mounted || theme === 'system' || !theme ? (
                  <Monitor className="h-[18px] w-[18px]" aria-hidden />
                ) : resolvedTheme === 'dark' ? (
                  <Moon className="h-[18px] w-[18px]" aria-hidden />
                ) : (
                  <Sun className="h-[18px] w-[18px]" aria-hidden />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => applyThemeSelection('system')}>
                <Monitor className="mr-2 h-4 w-4" aria-hidden />
                {t('appShell.themeSystem')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => applyThemeSelection('light')}>
                <Sun className="mr-2 h-4 w-4" aria-hidden />
                {t('appShell.themeLight')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => applyThemeSelection('dark')}>
                <Moon className="mr-2 h-4 w-4" aria-hidden />
                {t('appShell.themeDark')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <NotificationCenter />

          {/* Hesap menüsü — müşteride avatar → Ben */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-12 w-12 min-h-12 min-w-12 touch-manipulation rounded-full p-0 transition-shadow duration-base hover:ring-2 hover:ring-primary/20 sm:h-11 sm:min-h-11 sm:w-11 sm:min-w-11"
                aria-label={t('appShell.accountMenu')}
              >
                <div className="relative flex h-full w-full items-center justify-center">
                  <UserAvatarFrame frameId={(session?.user as { equippedFrame?: string | null } | undefined)?.equippedFrame || null}>
                    <Avatar className="h-9 w-9 sm:h-8 sm:w-8">
                      <AvatarImage src={session?.user?.image || ''} alt="" />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-sm text-primary-foreground">
                        {getInitials(session?.user?.name)}
                      </AvatarFallback>
                    </Avatar>
                  </UserAvatarFrame>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[85vh] w-56 overflow-y-auto">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{session?.user?.name}</p>
                  <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {meHref && (
                <DropdownMenuItem className="cursor-pointer" onSelect={() => router.push(meHref)}>
                  <User className="mr-2 h-4 w-4" aria-hidden />
                  {bl({ tr: 'Ben', en: 'Me' })}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="cursor-pointer" onSelect={() => router.push(settingsHref)}>
                <Settings className="mr-2 h-4 w-4" aria-hidden />
                {t('appShell.settings')}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer sm:hidden" onSelect={() => applyThemeSelection(resolvedTheme === 'dark' ? 'light' : 'dark')}>
                {resolvedTheme === 'dark' ? <Sun className="mr-2 h-4 w-4" aria-hidden /> : <Moon className="mr-2 h-4 w-4" aria-hidden />}
                {resolvedTheme === 'dark' ? t('appShell.themeLight') : t('appShell.themeDark')}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer sm:hidden" onSelect={() => setLocale(locale === 'en' ? 'tr' : 'en')}>
                <span className="mr-2 inline-flex h-4 w-4 items-center justify-center text-[10px] font-bold" aria-hidden>
                  {locale === 'en' ? 'TR' : 'EN'}
                </span>
                {locale === 'en' ? t('appShell.languageTr') : t('appShell.languageEn')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onSelect={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" aria-hidden />
                {t('appShell.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showSearch && ctx && paletteLoaded && (
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          items={paletteItems}
          asyncSource={role === 'staff' ? undefined : searchData}
          copy={paletteCopy}
        />
      )}
      {assistantHref && ctx && assistantLoaded && (
        <AssistantDrawer open={ctx.assistantOpen} onOpenChange={ctx.setAssistantOpen} assistantHref={assistantHref} />
      )}
    </header>
  );
}
