'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useId } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Search, Settings, User, LogOut, Moon, Sun, Monitor, Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { signOut } from 'next-auth/react';
import { NotificationCenter } from './notification-center';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { GlobalSearchResults } from './global-search-results';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useAppT } from '@/lib/app-locale';

interface DashboardHeaderProps {
  title?: string;
  description?: string;
  showSearch?: boolean;
  actions?: React.ReactNode;
}

interface SearchResults {
  users: { id: string; name: string | null; email: string; businessName: string | null; role: string; href: string }[];
  feedbacks: { id: string; text: string | null; rating: number; sentiment: string | null; createdAt: string; href: string }[];
  products: { id: string; name: string; categoryName?: string; href: string }[];
  qrCodes: { id: string; name: string; code: string; businessName: string | null; href: string }[];
}

export function DashboardHeader({ title, description, showSearch = true, actions }: DashboardHeaderProps) {
  const t = useAppT();
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const forceModeDom = (mode: 'light' | 'dark' | 'system') => {
    const resolved =
      mode === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : mode;
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
    localStorage.setItem('qratex-theme', mode);
    localStorage.setItem('theme', mode);
    forceModeDom(mode);
    setTheme(mode);
  };
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const desktopResultsRegionId = useId();
  const mobileResultsRegionId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut({ redirect: false });
      router.push('/auth/login');
      router.refresh();
    } catch {
      window.location.href = '/auth/login';
    }
  };

  const getSettingsLink = () => {
    switch (session?.user?.role) {
      case 'ADMIN': return '/admin/settings';
      case 'DEALER': return '/dealer/settings';
      default: return '/customer/settings';
    }
  };

  const fetchGlobalSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success && data.results) {
        setSearchResults(data.results);
        setSearchOpen(true);
      } else {
        setSearchResults(null);
      }
    } catch {
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (q.length < 2) {
      setSearchResults(null);
      setSearchOpen(false);
      return;
    }
    searchDebounceRef.current = setTimeout(() => fetchGlobalSearch(q), 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, fetchGlobalSearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalResults = useMemo(() => {
    if (!searchResults) return 0;
    return (
      searchResults.users.length +
      searchResults.feedbacks.length +
      searchResults.products.length +
      searchResults.qrCodes.length
    );
  }, [searchResults]);

  /** Ekran okuyucular: arama yüklemesi ve sonuç özeti */
  const searchStatusAnnouncement = useMemo(() => {
    if (!showSearch) return '';
    const q = searchQuery.trim();
    if (q.length === 0) return '';
    if (q.length < 2) return t('appShell.searchMinChars');
    if (searchLoading) return t('appShell.searching');
    if (!searchResults) return '';
    if (totalResults === 0) return t('appShell.noResults');
    return `${totalResults} ${t('appShell.resultsFound')}`;
  }, [showSearch, searchQuery, searchLoading, searchResults, totalResults, t]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    if (searchResults && totalResults > 0) {
      const first =
        searchResults.users[0] || searchResults.feedbacks[0] || searchResults.products[0] || searchResults.qrCodes[0];
      if (first && 'href' in first) {
        router.push(first.href);
        setSearchOpen(false);
        setMobileSearchOpen(false);
        setSearchQuery('');
      }
    } else {
      const base =
        session?.user?.role === 'ADMIN'
          ? '/admin/feedbacks'
          : session?.user?.role === 'DEALER'
            ? '/dealer/feedbacks'
            : '/customer/feedbacks';
      router.push(`${base}?search=${encodeURIComponent(q)}`);
      setMobileSearchOpen(false);
      setSearchQuery('');
    }
  };

  const navigateToResult = (href: string) => {
    router.push(href);
    setSearchOpen(false);
    setMobileSearchOpen(false);
    setSearchQuery('');
  };

  const showSearchResults =
    (searchResults || searchLoading) && searchQuery.trim().length >= 2;

  const desktopSearchPopoverOpen = Boolean(searchOpen && showSearchResults);
  const mobileSearchPopoverOpen = Boolean(mobileSearchOpen && showSearchResults);

  const focusFirstSearchHit = useCallback((regionId: string) => {
    if (typeof document === 'undefined') return;
    document.getElementById(regionId)?.querySelector<HTMLButtonElement>('button[data-global-search-hit]')?.focus();
  }, []);

  const focusActiveSearchInput = useCallback(() => {
    if (mobileSearchOpen) mobileSearchInputRef.current?.focus();
    else desktopSearchInputRef.current?.focus();
  }, [mobileSearchOpen]);

  const dismissSearchUi = useCallback(() => {
    setSearchOpen(false);
    setMobileSearchOpen(false);
  }, []);

  const handleDesktopSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearchOpen(false);
      return;
    }
    if (
      e.key === 'ArrowDown' &&
      desktopSearchPopoverOpen &&
      totalResults > 0 &&
      !searchLoading
    ) {
      e.preventDefault();
      focusFirstSearchHit(desktopResultsRegionId);
    }
  };

  const handleMobileSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setMobileSearchOpen(false);
      return;
    }
    if (
      e.key === 'ArrowDown' &&
      mobileSearchPopoverOpen &&
      totalResults > 0 &&
      !searchLoading
    ) {
      e.preventDefault();
      focusFirstSearchHit(mobileResultsRegionId);
    }
  };

  return (
    <header className="sticky top-0 z-40 -ml-[max(0.75rem,env(safe-area-inset-left,0px))] -mr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:-mx-4 lg:-mx-6 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:pl-4 sm:pr-4 lg:pl-6 lg:pr-6 py-2 sm:py-0 border-b border-border/60 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75 supports-[padding:env(safe-area-inset-top)]:pt-[env(safe-area-inset-top)] mb-3 sm:mb-4 min-h-14 sm:min-h-16">
      {showSearch ? (
        <p id="dashboard-global-search-status" role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {searchStatusAnnouncement}
        </p>
      ) : null}
      <div className="flex min-h-[3.25rem] sm:h-16 items-center justify-between gap-2">
        {/* Left - Title & Search */}
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
          {title && (
            <div className="hidden sm:block shrink-0">
              <h1 className="text-base sm:text-lg font-semibold truncate">{title}</h1>
              {description && (
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{description}</p>
              )}
            </div>
          )}
          {showSearch && (
            <div ref={searchRef} className="relative max-w-md flex-1 min-w-0 hidden sm:block">
              <form onSubmit={handleSearchSubmit} className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  ref={desktopSearchInputRef}
                  type="search"
                  placeholder={t('appShell.globalSearchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchResults && totalResults > 0 && setSearchOpen(true)}
                  onKeyDown={handleDesktopSearchKeyDown}
                  className="pl-10 pr-10 bg-muted/50 border-transparent focus:border-border/80 dark:focus:border-white/25 w-full"
                  aria-label={t('appShell.globalSearch')}
                  aria-describedby="dashboard-global-search-status"
                  aria-expanded={desktopSearchPopoverOpen}
                  aria-haspopup="listbox"
                  aria-autocomplete="list"
                  aria-controls={desktopSearchPopoverOpen ? desktopResultsRegionId : undefined}
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 shrink-0"
                  aria-label={t('appShell.search')}
                >
                  {searchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              </form>

              {searchOpen && showSearchResults && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border bg-popover shadow-lg z-50 max-h-[min(70vh,400px)] overflow-y-auto">
                  <GlobalSearchResults
                    resultsRegionId={desktopResultsRegionId}
                    visible={showSearchResults}
                    searchLoading={searchLoading}
                    searchResults={searchResults}
                    totalResults={totalResults}
                    onNavigate={navigateToResult}
                    onRequestFocusSearch={focusActiveSearchInput}
                    onDismiss={dismissSearchUi}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right - Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Page Actions */}
          {actions}
          <LanguageSwitcher className="h-10 w-10 min-h-10 min-w-10 rounded-full sm:h-9 sm:min-h-9 sm:w-9 sm:min-w-9" />

          {showSearch && (
            <Sheet open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 touch-manipulation transition-colors duration-200 sm:hidden min-h-11 min-w-11"
                  aria-label={t('appShell.search')}
                >
                  <Search className="h-[18px] w-[18px]" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="top" className="max-h-[90dvh] overflow-y-auto pt-12 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <SheetHeader className="text-left space-y-1 mb-4">
                  <SheetTitle>{t('appShell.globalSearch')}</SheetTitle>
                </SheetHeader>
                <form onSubmit={handleSearchSubmit} className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    ref={mobileSearchInputRef}
                    type="search"
                    placeholder={t('appShell.globalSearchPlaceholderShort')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleMobileSearchKeyDown}
                    className="pl-10 pr-10 bg-muted/50 border-transparent focus:border-border/80 dark:focus:border-white/25 w-full min-h-11 text-base"
                    autoFocus
                    aria-label={t('appShell.globalSearch')}
                    aria-describedby="dashboard-global-search-status"
                    aria-expanded={mobileSearchPopoverOpen}
                    aria-haspopup="listbox"
                    aria-autocomplete="list"
                    aria-controls={mobileSearchPopoverOpen ? mobileResultsRegionId : undefined}
                  />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 shrink-0 touch-manipulation"
                    aria-label={t('appShell.search')}
                  >
                    {searchLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Search className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </form>
                <div className="rounded-lg border bg-muted/30 max-h-[min(55dvh,320px)] overflow-y-auto">
                  <GlobalSearchResults
                    resultsRegionId={mobileResultsRegionId}
                    visible={showSearchResults}
                    searchLoading={searchLoading}
                    searchResults={searchResults}
                    totalResults={totalResults}
                    onNavigate={navigateToResult}
                    onRequestFocusSearch={focusActiveSearchInput}
                    onDismiss={dismissSearchUi}
                  />
                </div>
              </SheetContent>
            </Sheet>
          )}

          {/* Theme: Sistem / Açık / Koyu (tercih localStorage'da qratex-theme ile saklanır) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 min-h-10 min-w-10 sm:h-9 sm:min-h-9 sm:w-9 sm:min-w-9 touch-manipulation rounded-full transition-colors duration-200 hover:bg-muted"
                aria-label={t('appShell.themeSelect')}
              >
                {mounted && (theme === 'system' || !theme) ? (
                  <Monitor className="h-[18px] w-[18px]" aria-hidden />
                ) : mounted && resolvedTheme === 'dark' ? (
                  <Moon className="h-[18px] w-[18px] text-slate-300" aria-hidden />
                ) : mounted ? (
                  <Sun className="h-[18px] w-[18px] text-amber-600" aria-hidden />
                ) : (
                  <Monitor className="h-[18px] w-[18px]" aria-hidden />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => applyThemeSelection('system')} onClick={() => applyThemeSelection('system')}>
                <Monitor className="h-4 w-4 mr-2" />
                {t('appShell.themeSystem')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => applyThemeSelection('light')} onClick={() => applyThemeSelection('light')}>
                <Sun className="h-4 w-4 mr-2" />
                {t('appShell.themeLight')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => applyThemeSelection('dark')} onClick={() => applyThemeSelection('dark')}>
                <Moon className="h-4 w-4 mr-2" />
                {t('appShell.themeDark')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notifications */}
          <NotificationCenter />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-10 w-10 min-h-10 min-w-10 sm:h-9 sm:min-h-9 sm:w-9 sm:min-w-9 touch-manipulation rounded-full p-0 transition-shadow duration-200 hover:ring-2 hover:ring-primary/20"
                aria-label={t('appShell.accountMenu')}
              >
                <Avatar className="h-10 w-10 sm:h-9 sm:w-9">
                  <AvatarImage src={session?.user?.image || ''} />
                  <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-sm text-primary-foreground">
                    {getInitials(session?.user?.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-[85vh] overflow-y-auto">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{session?.user?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {session?.user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => router.push(getSettingsLink())}
              >
                <User className="mr-2 h-4 w-4" />
                {t('appShell.profile')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => router.push(getSettingsLink())}
              >
                <Settings className="mr-2 h-4 w-4" />
                {t('appShell.settings')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t('appShell.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>


    </header>
  );
}
