'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { useAppT } from '@/lib/app-locale';
import { safeLocalStorageSetItem } from '@/lib/safe-web-storage';

export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useAppT();
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

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
    safeLocalStorageSetItem('qratex-theme', mode);
    safeLocalStorageSetItem('theme', mode);
    forceModeDom(mode);
    setTheme(mode);
  };

  const toggleTheme = () => {
    applyThemeSelection(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipToMainContent targetId="auth-main" />
      <header className="safe-top sticky top-0 z-20 flex items-center justify-between border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <Link prefetch={false}
          href="/"
          className="flex w-fit cursor-pointer items-center gap-2 rounded-lg outline-none ring-offset-background transition-opacity duration-200 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {mounted && (
            <>
              <Image
                src="/logo/logo.png"
                alt="QRateX Logo"
                width={56}
                height={56}
                className="object-contain h-10 sm:h-11 hidden dark:block"
                priority
              />
              <Image
                src="/logo/logo-light.png"
                alt="QRateX Logo"
                width={56}
                height={56}
                className="object-contain h-10 sm:h-11 block dark:hidden"
                priority
              />
              <Image
                src="/logo/font.png"
                alt="QRateX"
                width={140}
                height={36}
                className="object-contain h-10 sm:h-11 hidden dark:block"
                style={{ width: 'auto' }}
                priority
              />
              <Image
                src="/logo/font-light.png"
                alt="QRateX"
                width={140}
                height={36}
                className="object-contain h-10 sm:h-11 block dark:hidden"
                style={{ width: 'auto' }}
                priority
              />
            </>
          )}
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-11 min-h-11 min-w-11 w-11 touch-manipulation rounded-full transition-colors duration-200"
          aria-label={t('common.toggleTheme')}
        >
          {mounted && resolvedTheme === 'dark' ? (
            <Sun className="h-5 w-5" aria-hidden />
          ) : (
            <Moon className="h-5 w-5" aria-hidden />
          )}
        </Button>
      </header>

      <main
        id="auth-main"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center p-4 outline-none pb-[max(1.5rem,env(safe-area-inset-bottom))] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-6"
      >
        {children}
      </main>

      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 gradient-mesh opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/80 to-background" />
      </div>
    </div>
  );
}
