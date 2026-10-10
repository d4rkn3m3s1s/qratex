'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { Sun, Moon, Languages } from 'lucide-react';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { safeLocalStorageSetItem } from '@/lib/safe-web-storage';
import { useAuthCopy } from './p-auth/copy';

const iconButton =
  'inline-flex h-11 min-w-11 touch-manipulation items-center justify-center gap-1.5 rounded-full px-3 text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Kimlik ekranlarının TEK kabuğu (QDL v2 · ops kaydı): sakin düz zemin, üstte logo + dil +
 * tema, altta yasal bağlantılar. Landing'in gradient zemini kaldırıldı (yol haritası §4.2:
 * auth "animasyonsuz ya da tek giriş, landing zemini kaldırılır").
 *
 * Logo artık `mounted` beklemeden ilk HTML'de çizilir (iki tema görseli CSS `dark:` ile
 * ayrışır) → başlıkta boş alan ve yerleşim kayması yok.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useAppT();
  const copy = useAuthCopy();
  const { locale, setLocale } = useAppLocale();
  const { resolvedTheme, setTheme } = useTheme();

  const forceModeDom = (mode: 'light' | 'dark') => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(mode);
    root.setAttribute('data-theme', mode);
    root.style.colorScheme = mode;
    const body = document.body;
    if (body) {
      body.classList.remove('light', 'dark');
      body.classList.add(mode);
      body.setAttribute('data-theme', mode);
      body.style.colorScheme = mode;
    }
  };

  const toggleTheme = () => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    safeLocalStorageSetItem('qratex-theme', next);
    safeLocalStorageSetItem('theme', next);
    forceModeDom(next);
    setTheme(next);
  };

  const nextLocale = locale === 'en' ? 'tr' : 'en';

  return (
    <div className="flex min-h-dvh flex-col bg-surface-0 text-fg" data-register="ops">
      <SkipToMainContent targetId="auth-main" />
      <header className="safe-top flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <Link
          prefetch={false}
          href="/"
          aria-label={copy.shellHome}
          className="flex w-fit items-center gap-2 rounded-lg outline-none transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image src="/logo/logo.png" alt="" width={40} height={40} className="hidden h-9 w-9 object-contain dark:block" priority />
          <Image src="/logo/logo-light.png" alt="" width={40} height={40} className="block h-9 w-9 object-contain dark:hidden" priority />
          <Image src="/logo/font.png" alt="" width={112} height={28} className="hidden h-7 w-auto object-contain dark:block" />
          <Image src="/logo/font-light.png" alt="" width={112} height={28} className="block h-7 w-auto object-contain dark:hidden" />
        </Link>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLocale(nextLocale)}
            className={iconButton}
            aria-label={`${copy.shellLanguage}: ${nextLocale === 'en' ? 'English' : 'Türkçe'}`}
            lang={nextLocale}
          >
            <Languages className="h-5 w-5" aria-hidden />
            <span className="qx-small font-semibold uppercase">{nextLocale}</span>
          </button>
          <button type="button" onClick={toggleTheme} className={iconButton} aria-label={t('common.toggleTheme')}>
            {/* İkon CSS ile seçilir: hidrasyon öncesi tema bilinmese de doğru ikon görünür. */}
            <Sun className="hidden h-5 w-5 dark:block" aria-hidden />
            <Moon className="block h-5 w-5 dark:hidden" aria-hidden />
          </button>
        </div>
      </header>

      <main
        id="auth-main"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-start px-4 pb-8 pt-2 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:justify-center sm:px-6 sm:pt-6"
      >
        {children}
      </main>

      <footer className="pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <nav aria-label={copy.shellTerms} className="flex flex-wrap items-center justify-center gap-x-1 px-4">
          {[
            { href: '/kullanim-sartlari', label: copy.shellTerms },
            { href: '/gizlilik-politikasi', label: copy.shellPrivacy },
            { href: '/kvkk-aydinlatma-metni', label: copy.shellKvkk },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              prefetch={false}
              className="qx-caption inline-flex min-h-11 items-center rounded-sm px-2 text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
