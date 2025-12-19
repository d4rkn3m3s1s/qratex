'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { Menu, LogIn, ChevronRight, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const navigation = [
  { label: 'Ana Sayfa', href: '/' },
  { label: 'Özellikler', href: '/#features' },
  { label: 'Fiyatlandırma', href: '/#pricing' },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const { setTheme, resolvedTheme } = useTheme();

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

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  // Get the correct logo based on theme
  const logoSrc = mounted && resolvedTheme === 'dark' 
    ? '/logo/logo.png' 
    : '/logo/logo-light.png';

  const fontLogoSrc = mounted && resolvedTheme === 'dark'
    ? '/logo/font.png'
    : '/logo/font-light.png';

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300 safe-top',
        isScrolled
          ? 'bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm'
          : 'bg-transparent'
      )}
    >
      <nav className="container mx-auto px-4 h-20 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <motion.div
            className="relative"
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.95 }}
          >
            {mounted && (
              <Image
                src={logoSrc}
                alt="QRATEX Logo"
                width={48}
                height={48}
                className="object-contain"
                priority
              />
            )}
          </motion.div>
          <div className="hidden sm:block">
            {mounted && (
              <Image
                src={fontLogoSrc}
                alt="QRATEX"
                width={120}
                height={32}
                className="object-contain"
                style={{ width: 'auto', height: 'auto' }}
                priority
              />
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
                'text-base font-medium transition-colors hover:text-primary relative group',
                pathname === item.href
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              {item.label}
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all group-hover:w-full" />
            </Link>
          ))}
        </div>

        {/* CTA Buttons & Theme Toggle */}
        <div className="hidden md:flex items-center gap-3">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-full w-10 h-10"
          >
            {mounted && resolvedTheme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
            <span className="sr-only">Tema Değiştir</span>
          </Button>

          {session?.user ? (
            <Button asChild variant="gradient" size="lg">
              <Link href={getDashboardLink()}>
                Dashboard
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="lg">
                <Link href="/auth/login">
                  <LogIn className="w-4 h-4 mr-2" />
                  Giriş Yap
                </Link>
              </Button>
              <Button asChild variant="gradient" size="lg">
                <Link href="/auth/register">
                  Ücretsiz Başla
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu */}
        <div className="flex items-center gap-2 md:hidden">
          {/* Theme Toggle Mobile */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-full"
          >
            {mounted && resolvedTheme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
            <span className="sr-only">Tema Değiştir</span>
          </Button>

          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Menü</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-80">
              <div className="flex flex-col h-full pt-8">
                {/* Mobile Logo */}
                <div className="flex items-center gap-3 mb-8">
                  {mounted && (
                    <>
                      <Image
                        src={logoSrc}
                        alt="QRATEX Logo"
                        width={48}
                        height={48}
                        className="object-contain"
                      />
                      <Image
                        src={fontLogoSrc}
                        alt="QRATEX"
                        width={120}
                        height={32}
                        className="object-contain"
                        style={{ width: 'auto', height: 'auto' }}
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
                          'block text-lg font-medium py-2 transition-colors',
                          pathname === item.href
                            ? 'text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {item.label}
                      </Link>
                    </motion.div>
                  ))}
                </div>

                <div className="space-y-3 pt-6 border-t">
                  {session?.user ? (
                    <Button asChild variant="gradient" className="w-full" size="lg">
                      <Link href={getDashboardLink()} onClick={() => setIsMobileMenuOpen(false)}>
                        Dashboard
                      </Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild variant="outline" className="w-full" size="lg">
                        <Link href="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>
                          Giriş Yap
                        </Link>
                      </Button>
                      <Button asChild variant="gradient" className="w-full" size="lg">
                        <Link href="/auth/register" onClick={() => setIsMobileMenuOpen(false)}>
                          Ücretsiz Başla
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
