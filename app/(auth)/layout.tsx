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
              {/* Dark theme logo */}
              <Image
                src="/logo/logo.png"
                alt="QRATEX Logo"
                width={56}
                height={56}
                className="object-contain w-12 h-12 sm:w-14 sm:h-14 hidden dark:block"
                priority
              />
              {/* Light theme logo */}
              <Image
                src="/logo/logo-light.png"
                alt="QRATEX Logo"
                width={56}
                height={56}
                className="object-contain w-12 h-12 sm:w-14 sm:h-14 block dark:hidden"
                priority
              />
              {/* Dark theme font */}
              <Image
                src="/logo/font.png"
                alt="QRATEX"
                width={140}
                height={36}
                className="object-contain h-8 sm:h-9 hidden dark:block"
                style={{ width: 'auto' }}
                priority
              />
              {/* Light theme font */}
              <Image
                src="/logo/font-light.png"
                alt="QRATEX"
                width={140}
                height={36}
                className="object-contain h-8 sm:h-9 block dark:hidden"
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
