'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get the correct logo based on theme
  const logoSrc = mounted && resolvedTheme === 'dark' 
    ? '/logo/logo.png' 
    : '/logo/logo-light.png';

  const fontLogoSrc = mounted && resolvedTheme === 'dark'
    ? '/logo/font.png'
    : '/logo/font-light.png';

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <header className="p-4 safe-top flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 w-fit">
          {mounted && (
            <>
              <Image
                src={logoSrc}
                alt="QRATEX Logo"
                width={56}
                height={56}
                className="object-contain w-12 h-12 sm:w-14 sm:h-14"
                priority
              />
              <Image
                src={fontLogoSrc}
                alt="QRATEX"
                width={140}
                height={36}
                className="object-contain h-8 sm:h-9"
                style={{ width: 'auto' }}
                priority
              />
            </>
          )}
        </Link>

        {/* Theme Toggle */}
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
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        {children}
      </main>

      {/* Background Effects */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 gradient-mesh opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/80 to-background" />
      </div>
    </div>
  );
}
