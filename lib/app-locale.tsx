'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { defaultLocale, translate, type Locale, type MessageTree } from '@/i18n/core';
import trMessages from '@/messages/tr.json';
import { LOCALE_STORAGE_KEY, writeLocaleCookieClient } from '@/lib/locale-shared';

/**
 * İstemci dil sağlayıcısı (kök `Providers` içinde, her sayfada).
 *
 * Paket diyeti (perf Y1): eskiden `@/i18n/request` üzerinden TR + EN sözlüklerinin TAMAMI
 * (314 KB ham / ~98 KB gzip) her sayfanın ortak paketine giriyordu. Artık yalnız varsayılan
 * dil (TR) statik; EN yalnız kullanıcı İngilizce seçtiyse ayrı parça olarak bir kez iner.
 * İnene kadar TR metni gösterilir — eskiden de dil, ilk efekte kadar TR başlıyordu.
 */
const catalogs: Partial<Record<Locale, MessageTree>> = { tr: trMessages as MessageTree };
let enLoading: Promise<void> | null = null;

function loadCatalog(locale: Locale): Promise<void> {
  if (catalogs[locale]) return Promise.resolve();
  if (locale === 'en') {
    enLoading ??= import('@/messages/en.json')
      .then((mod) => {
        catalogs.en = ((mod as { default?: unknown }).default ?? mod) as MessageTree;
      })
      .catch(() => {
        // Parça inemedi (çevrimdışı vb.): TR ile devam; bir sonraki seçimde yeniden denenir.
        enLoading = null;
      });
    return enLoading;
  }
  return Promise.resolve();
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Katalog inince artar → bağlam tüketicileri (useAppT) yeni dille yeniden çizilir. */
  catalogVersion: number;
};

const AppLocaleContext = createContext<LocaleContextValue | null>(null);

function normalizeLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : defaultLocale;
}

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  // Seçili dilin kataloğu hazır olunca bir kez yeniden çizmek için sürüm sayacı.
  const [catalogVersion, setCatalogVersion] = useState(0);
  const sessionLocale = normalizeLocale((session?.user as { preferredLanguage?: string } | undefined)?.preferredLanguage);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = typeof window !== 'undefined' ? window.localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    } catch {
      saved = null;
    }
    const next = saved ? normalizeLocale(saved) : sessionLocale;
    setLocaleState(next);
    writeLocaleCookieClient(next);
  }, [sessionLocale]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
    if (catalogs[locale]) return;
    let cancelled = false;
    void loadCatalog(locale).then(() => {
      if (!cancelled && catalogs[locale]) setCatalogVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    const normalized = normalizeLocale(next);
    setLocaleState(normalized);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
      } catch {
        /* depolama kapalı: çerez yine yazılır */
      }
      writeLocaleCookieClient(normalized);
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale, catalogVersion }), [locale, setLocale, catalogVersion]);

  return <AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>;
}

export function useAppLocale() {
  const ctx = useContext(AppLocaleContext);
  if (!ctx) throw new Error('useAppLocale must be used within AppLocaleProvider');
  return ctx;
}

export function useAppT() {
  const { locale, catalogVersion } = useAppLocale();
  // Katalog henüz inmediyse (yalnız EN'in ilk seçiminde, kısa süre) varsayılan dil kullanılır.
  return useMemo(
    () => (key: string, variables?: Record<string, string | number>) =>
      translate(catalogs[locale] ?? catalogs[defaultLocale], key, variables),
    // catalogVersion: katalog inince yeni fonksiyon kimliği (memo'lu tüketiciler de güncellenir).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, catalogVersion]
  );
}
