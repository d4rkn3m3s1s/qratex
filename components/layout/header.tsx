'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { m as Motion } from 'framer-motion';
import { staggerDelay } from '@/lib/motion/variants';
import { Menu, LogIn, ChevronRight, Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';
import { safeLocalStorageSetItem } from '@/lib/safe-web-storage';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { roleHome } from '@/lib/auth/post-login-target';

/**
 * Logo zaten `/` — tekrar "Ana Sayfa" linki yok. Eski `/#features` ve `/#pricing` çapaları
 * landing yeniden tasarımında kalktı (özellikler + fiyatlar işletme sayfasında, URL korunur);
 * tüketici için "Nasıl çalışır" eklendi. `label` verilen öğe i18n sözlüğüne bağlı değildir.
 */
type NavItem = { href: string; labelKey?: string; label?: { tr: string; en: string } };
const navigation: NavItem[] = [
  { label: { tr: 'Nasıl çalışır', en: 'How it works' }, href: '/#nasil-calisir' },
  { labelKey: 'appShell.navFeatures', href: '/neden-qratex#ozellikler' },
  { labelKey: 'appShell.navPricing', href: '/neden-qratex#fiyatlar' },
  { labelKey: 'appShell.navBlog', href: '/blog' },
  { labelKey: 'appShell.navWhyQratex', href: '/neden-qratex' },
];

/** Çapalı bağlantılar hiçbir zaman "aktif" sayılmaz; yalnız tam yol eşleşmesi. */
function isNavActive(pathname: string | null, href: string): boolean {
  return !href.includes('#') && pathname === href;
}

function applyThemeSelection(mode: 'light' | 'dark' | 'system', setTheme: (theme: string) => void) {
  safeLocalStorageSetItem('qratex-theme', mode);
  safeLocalStorageSetItem('theme', mode);
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  for (const el of [document.documentElement, document.body]) {
    if (!el) continue;
    el.classList.remove('light', 'dark');
    el.classList.add(resolved);
    el.setAttribute('data-theme', resolved);
    el.style.colorScheme = resolved;
  }
  setTheme(mode);
}

/**
 * Tema seçici — modül düzeyinde (landing.md Bulgu 15: eskiden Header gövdesinde tanımlıydı,
 * her kaydırma durum değişiminde yeniden mount olup açık menüyü kapatıyordu). Tek `onSelect`.
 */
function ThemeSwitcher({ className, mounted }: { className?: string; mounted: boolean }) {
  const t = useAppT();
  const { theme, setTheme, resolvedTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('appShell.themeSelect')}
          className={cn(
            'h-11 min-h-11 min-w-11 w-11 shrink-0 touch-manipulation rounded-full transition-colors duration-200',
            className
          )}
        >
          {mounted && (theme === 'system' || !theme) ? (
            <Monitor className="h-5 w-5" aria-hidden />
          ) : mounted && resolvedTheme === 'dark' ? (
            <Moon className="h-5 w-5" aria-hidden />
          ) : mounted ? (
            <Sun className="h-5 w-5" aria-hidden />
          ) : (
            <Monitor className="h-5 w-5" aria-hidden />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => applyThemeSelection('system', setTheme)}>
          <Monitor className="h-4 w-4 mr-2" aria-hidden /> {t('appShell.themeSystem')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => applyThemeSelection('light', setTheme)}>
          <Sun className="h-4 w-4 mr-2" aria-hidden /> {t('appShell.themeLight')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => applyThemeSelection('dark', setTheme)}>
          <Moon className="h-4 w-4 mr-2" aria-hidden /> {t('appShell.themeDark')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const t = useAppT();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const { locale } = useAppLocale();
  const navLabel = (item: NavItem) => (item.label ? item.label[locale === 'en' ? 'en' : 'tr'] : t(item.labelKey ?? ''));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // QNB tarzı: aşağı kaydırınca üst bar gizlenir, yukarı kaydırınca geri gelir.
    // rAF ile throttle; küçük hareketleri yok say; sayfa başında her zaman görünür.
    let lastY = window.scrollY;
    let ticking = false;
    const THRESHOLD = 10; // titremeyi önlemek için minimum hareket
    const update = () => {
      const y = Math.max(0, window.scrollY);
      setIsScrolled(y > 10);
      const delta = y - lastY;
      if (y <= 80) {
        // sayfa tepesine yakınken daima göster
        setIsHidden(false);
        lastY = y;
      } else if (Math.abs(delta) > THRESHOLD) {
        setIsHidden(delta > 0); // aşağı => gizle, yukarı => göster
        lastY = y;
      }
      ticking = false;
    };
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Mobil menü açıldığında üst bar asla gizli kalmasın
  useEffect(() => {
    if (isMobileMenuOpen) setIsHidden(false);
  }, [isMobileMenuOpen]);

  // Tek kaynak rol → ana sayfa (STAFF dahil; eskiden STAFF /customer'a gidip proxy ile ikinci kez yönleniyordu).
  const getDashboardLink = () => (session?.user ? roleHome(session.user.role) : '/auth/login');

  return (
    <header
      className={cn(
        'safe-top fixed left-0 right-0 top-0 z-50 transition-all duration-300 will-change-transform',
        // QNB tarzı gizlen/göster (reduced-motion tercihinde CSS transition devre dışı kalır)
        // Klavye odağı gizli üst bara girerse bar geri gelir (WCAG 2.4.11 odak örtülmesi).
        isHidden ? '-translate-y-full focus-within:translate-y-0' : 'translate-y-0',
        isScrolled
          ? 'border-b border-border/40 bg-background/60 shadow-sm backdrop-blur-xl'
          : 'border-b border-transparent bg-background/20 backdrop-blur-md supports-[backdrop-filter]:bg-background/10'
      )}
    >
      <nav className="container mx-auto flex h-20 items-center justify-between px-4" aria-label={t('appShell.siteMenu')}>
        {/* Logo */}
        <Link prefetch={false}
          href="/"
          className="group flex cursor-pointer items-center gap-3 rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* SSR'da da erişilebilir ad (görseller yalnız mount sonrası çizilir). */}
          <span className="sr-only">QRateX</span>
          <Motion.div
            className="relative h-14 w-14"
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.95 }}
          >
            {mounted && (
              <>
                {/* Dark theme logo (light/white colored) */}
                <Image
                  src="/logo/logo.png"
                  alt="QRateX Logo"
                  width={56}
                  height={56}
                  className="object-contain hidden dark:block"
                />
                {/* Light theme logo (dark colored) */}
                <Image
                  src="/logo/logo-light.png"
                  alt="QRateX Logo"
                  width={56}
                  height={56}
                  className="object-contain block dark:hidden"
                />
              </>
            )}
          </Motion.div>
          <div className="hidden sm:block">
            {mounted && (
              <>
                {/* Dark theme font (light/white colored) */}
                <Image
                  src="/logo/font.png"
                  alt="QRateX"
                  width={150}
                  height={40}
                  className="object-contain hidden dark:block"
                  style={{ height: 'auto' }}
                />
                {/* Light theme font (dark colored) */}
                <Image
                  src="/logo/font-light.png"
                  alt="QRateX"
                  width={150}
                  height={40}
                  className="object-contain block dark:hidden"
                  style={{ height: 'auto' }}
                />
              </>
            )}
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-6 lg:gap-8">
          {navigation.map((item) => (
            <Link prefetch={false}
              key={item.href}
              href={item.href}
              className={cn(
                'group relative rounded-md px-1 py-1 text-sm font-semibold tracking-tight outline-none ring-offset-background transition-colors duration-200 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isNavActive(pathname, item.href)
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              {navLabel(item)}
              <span aria-hidden className="absolute -bottom-1 left-0 h-0.5 w-0 bg-primary transition-[width] duration-200 group-hover:w-full" />
            </Link>
          ))}
        </div>

        {/* CTA Buttons & Theme Toggle */}
        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher className="h-11 min-h-11 min-w-11 w-11 rounded-full" />
          <ThemeSwitcher mounted={mounted} />

          {session?.user ? (
            <>
              <span className="inline-flex shrink-0" aria-hidden>
                <Avatar className="h-9 w-9 ring-2 ring-primary/30">
                  <AvatarImage src={session.user.image || ''} />
                  <AvatarFallback className="text-xs">{getInitials(session.user.name)}</AvatarFallback>
                </Avatar>
              </span>
              <Button asChild variant="gradient" size="lg">
                <Link prefetch={false} href={getDashboardLink()} className="min-h-11">
                  {t('appShell.dashboard')}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="lg">
                <Link prefetch={false} href="/auth/login" className="min-h-11">
                  <LogIn className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                  {t('appShell.login')}
                </Link>
              </Button>
              <Button asChild variant="gradient" size="lg">
                <Link prefetch={false} href="/auth/register" className="min-h-11">
                  {t('appShell.getStartedFree')}
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu */}
        <div className="flex items-center gap-2 md:hidden">
          <LanguageSwitcher className="min-h-11 min-w-11 w-11 h-11 rounded-full" />
          {/* Theme Toggle Mobile */}
          <ThemeSwitcher mounted={mounted} />

          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-haspopup="dialog"
                aria-expanded={isMobileMenuOpen}
                aria-controls="site-mobile-nav-sheet"
                className="min-h-11 min-w-11 touch-manipulation transition-colors duration-200"
                aria-label={isMobileMenuOpen ? t('appShell.closeMenu') : t('appShell.openMenu')}
              >
                <Menu className="h-6 w-6" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              id="site-mobile-nav-sheet"
              aria-describedby={undefined}
              side="right"
              className="w-full pb-[max(1rem,env(safe-area-inset-bottom))] sm:w-80"
            >
              {/* Diyaloğun erişilebilir adı (Radix başlıksız diyalog uyarısı + ekran okuyucu). */}
              <SheetTitle className="sr-only">{t('appShell.siteMenu')}</SheetTitle>
              <div className="flex flex-col h-full pt-8">
                {/* Mobile Logo */}
                <div className="flex items-center gap-3 mb-8">
                  {mounted && (
                    <>
                      {/* Dark theme logo */}
                      <Image
                        src="/logo/logo.png"
                        alt="QRateX Logo"
                        width={56}
                        height={56}
                        className="object-contain hidden dark:block"
                      />
                      {/* Light theme logo */}
                      <Image
                        src="/logo/logo-light.png"
                        alt="QRateX Logo"
                        width={56}
                        height={56}
                        className="object-contain block dark:hidden"
                      />
                      {/* Dark theme font */}
                      <Image
                        src="/logo/font.png"
                        alt="QRateX"
                        width={150}
                        height={40}
                        className="object-contain hidden dark:block"
                        style={{ height: 'auto' }}
                      />
                      {/* Light theme font */}
                      <Image
                        src="/logo/font-light.png"
                        alt="QRateX"
                        width={150}
                        height={40}
                        className="object-contain block dark:hidden"
                        style={{ height: 'auto' }}
                      />
                    </>
                  )}
                </div>

                <div className="flex-1 space-y-6">
                  {navigation.map((item, index) => (
                    <Motion.div
                      key={item.href}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: staggerDelay(index) }}
                    >
                      <Link prefetch={false}
                        href={item.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={cn(
                          'flex min-h-11 cursor-pointer touch-manipulation items-center rounded-lg text-lg font-medium outline-none ring-offset-background transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          isNavActive(pathname, item.href)
                            ? 'text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {navLabel(item)}
                      </Link>
                    </Motion.div>
                  ))}
                </div>

                <div className="space-y-3 pt-6 border-t">
                  {session?.user ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-lg border p-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={session.user.image || ''} />
                          <AvatarFallback>{getInitials(session.user.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{session.user.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
                        </div>
                      </div>
                      <Button asChild variant="gradient" className="w-full" size="lg">
                        <Link prefetch={false} href={getDashboardLink()} onClick={() => setIsMobileMenuOpen(false)}>
                          {t('appShell.dashboard')}
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button asChild variant="outline" className="w-full" size="lg">
                        <Link prefetch={false} href="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>
                          {t('appShell.login')}
                        </Link>
                      </Button>
                      <Button asChild variant="gradient" className="w-full" size="lg">
                        <Link prefetch={false} href="/auth/register" onClick={() => setIsMobileMenuOpen(false)}>
                          {t('appShell.getStartedFree')}
                        </Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
