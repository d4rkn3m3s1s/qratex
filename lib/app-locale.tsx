'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { defaultLocale, t, type Locale } from '@/i18n/request';
import { LOCALE_STORAGE_KEY, writeLocaleCookieClient } from '@/lib/locale-shared';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const AppLocaleContext = createContext<LocaleContextValue | null>(null);

function normalizeLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : defaultLocale;
}

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const sessionLocale = normalizeLocale((session?.user as { preferredLanguage?: string } | undefined)?.preferredLanguage);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    const next = saved ? normalizeLocale(saved) : sessionLocale;
    setLocaleState(next);
    writeLocaleCookieClient(next);
  }, [sessionLocale]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    const normalized = normalizeLocale(next);
    setLocaleState(normalized);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
      writeLocaleCookieClient(normalized);
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>;
}

export function useAppLocale() {
  const ctx = useContext(AppLocaleContext);
  if (!ctx) throw new Error('useAppLocale must be used within AppLocaleProvider');
  return ctx;
}

export function useAppT() {
  const { locale } = useAppLocale();
  return useMemo(() => (key: string) => t(locale, key), [locale]);
}

