'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { Menu, LogIn, ChevronRight, Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useAppT } from '@/lib/app-locale';

const navigation = [
  { labelKey: 'appShell.navHome', href: '/' },
  { labelKey: 'appShell.navFeatures', href: '/#features' },
  { labelKey: 'appShell.navPricing', href: '/#pricing' },
  { labelKey: 'appShell.navBlog', href: '/blog' },
  { labelKey: 'appShell.navWhyQratex', href: '/neden-qratex' },
];

export function Header() {
  const t = useAppT();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const getDashboardLink = () => {
    if (!session?.user) return '/auth/login';
    switch (session.user.role) {
      case 'ADMIN':
        return '/admin';
      case 'DEALER':
        return '/dealer';
      default:
        return '/customer';
    }
  };

  const ThemeSwitcher = ({ className }: { className?: string }) => (
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
        <DropdownMenuItem onSelect={() => applyThemeSelection('system')} onClick={() => applyThemeSelection('system')}>
          <Monitor className="h-4 w-4 mr-2" /> {t('appShell.themeSystem')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => applyThemeSelection('light')} onClick={() => applyThemeSelection('light')}>
          <Sun className="h-4 w-4 mr-2" /> {t('appShell.themeLight')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => applyThemeSelection('dark')} onClick={() => applyThemeSelection('dark')}>
          <Moon className="h-4 w-4 mr-2" /> {t('appShell.themeDark')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <header
      className={cn(
        'safe-top fixed left-0 right-0 top-0 z-50 transition-all duration-300',
        isScrolled
          ? 'border-b border-border/50 bg-background/80 shadow-sm backdrop-blur-xl'
          : 'bg-transparent'
      )}
    >
      <nav className="container mx-auto flex h-20 items-center justify-between px-4" aria-label={t('appShell.siteMenu')}>
        {/* Logo */}
        <Link
          href="/"
          className="group flex cursor-pointer items-center gap-3 rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        >
          <motion.div
            className="relative"
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.95 }}
          >
            {mounted && (
              <>
                {/* Dark theme logo (light/white colored) */}
                <Image
                  src="/logo/logo.png"
                  alt="QRATEX Logo"
                  width={56}
                  height={56}
                  className="object-contain hidden dark:block"
                  priority
                />
                {/* Light theme logo (dark colored) */}
                <Image
                  src="/logo/logo-light.png"
                  alt="QRATEX Logo"
                  width={56}
                  height={56}
                  className="object-contain block dark:hidden"
                  priority
                />
              </>
            )}
          </motion.div>
          <div className="hidden sm:block">
            {mounted && (
              <>
                {/* Dark theme font (light/white colored) */}
                <Image
                  src="/logo/font.png"
                  alt="QRATEX"
                  width={150}
                  height={40}
                  className="object-contain hidden dark:block"
                  style={{ height: 'auto' }}
                  priority
                />
                {/* Light theme font (dark colored) */}
                <Image
                  src="/logo/font-light.png"
                  alt="QRATEX"
                  width={150}
                  height={40}
                  className="object-contain block dark:hidden"
                  style={{ height: 'auto' }}
                  priority
                />
              </>
            )}
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative rounded-md px-1 py-0.5 text-base font-medium outline-none ring-offset-background transition-colors duration-200 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                pathname === item.href
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              {t(item.labelKey)}
              <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-primary transition-[width] duration-200 group-hover:w-full" />
            </Link>
          ))}
        </div>

        {/* CTA Buttons & Theme Toggle */}
        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher className="h-11 min-h-11 min-w-11 w-11 rounded-full" />
          <ThemeSwitcher />

          {session?.user ? (
            <>
              <span className="inline-flex shrink-0" aria-hidden>
                <Avatar className="h-9 w-9 ring-2 ring-primary/30">
                  <AvatarImage src={session.user.image || ''} />
                  <AvatarFallback className="text-xs">{getInitials(session.user.name)}</AvatarFallback>
                </Avatar>
              </span>
              <Button asChild variant="gradient" size="lg">
                <Link href={getDashboardLink()} className="min-h-11">
                  {t('appShell.dashboard')}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="lg">
                <Link href="/auth/login" className="min-h-11">
                  <LogIn className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                  {t('appShell.login')}
                </Link>
              </Button>
              <Button asChild variant="gradient" size="lg">
                <Link href="/auth/register" className="min-h-11">
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
          <ThemeSwitcher />

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
              side="right"
              className="w-full pb-[max(1rem,env(safe-area-inset-bottom))] sm:w-80"
            >
              <div className="flex flex-col h-full pt-8">
                {/* Mobile Logo */}
                <div className="flex items-center gap-3 mb-8">
                  {mounted && (
                    <>
                      {/* Dark theme logo */}
                      <Image
                        src="/logo/logo.png"
                        alt="QRATEX Logo"
                        width={56}
                        height={56}
                        className="object-contain hidden dark:block"
                      />
                      {/* Light theme logo */}
                      <Image
                        src="/logo/logo-light.png"
                        alt="QRATEX Logo"
                        width={56}
                        height={56}
                        className="object-contain block dark:hidden"
                      />
                      {/* Dark theme font */}
                      <Image
                        src="/logo/font.png"
                        alt="QRATEX"
                        width={150}
                        height={40}
                        className="object-contain hidden dark:block"
                        style={{ height: 'auto' }}
                      />
                      {/* Light theme font */}
                      <Image
                        src="/logo/font-light.png"
                        alt="QRATEX"
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
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={cn(
                          'flex min-h-11 cursor-pointer touch-manipulation items-center rounded-lg text-lg font-medium outline-none ring-offset-background transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          pathname === item.href
                            ? 'text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {t(item.labelKey)}
                      </Link>
                    </motion.div>
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
                        <Link href={getDashboardLink()} onClick={() => setIsMobileMenuOpen(false)}>
                          {t('appShell.dashboard')}
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button asChild variant="outline" className="w-full" size="lg">
                        <Link href="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>
                          {t('appShell.login')}
                        </Link>
                      </Button>
                      <Button asChild variant="gradient" className="w-full" size="lg">
                        <Link href="/auth/register" onClick={() => setIsMobileMenuOpen(false)}>
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
