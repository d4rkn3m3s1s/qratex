'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { defaultLocale, translate, type Locale, type MessageTree } from '@/i18n/core';
import { getFormatters, type Formatters } from '@/lib/i18n/format';
import trMessages from '@/messages/tr.json';
import {
  LOCALE_OWNER_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  readLocaleCookieClient,
  writeLocaleCookieClient,
} from '@/lib/locale-shared';

/**
 * İstemci dil sağlayıcısı — dilin TEK yazarı (mobil-erisilebilirlik-i18n B2).
 *
 * Paket diyeti (perf Y1): istemci paketinde yalnız varsayılan dil (TR) statik; EN ya sunucudan
 * (segment sınırı, aşağıda) hazır gelir ya da kullanıcı İngilizce seçince ayrı parça olarak bir
 * kez iner.
 *
 * Öncelik (B2 önerisi): oturum açıkken hesabın DB tercihi > bu cihazdaki seçim > çerez > `tr`.
 *  - Seçim localStorage'da SAHİBİYLE (kullanıcı kimliği, anonimse '') saklanır. Paylaşılan
 *    cihazda önceki kullanıcının seçimi yeni kullanıcının DB tercihini EZMEZ (sahip farklı).
 *  - Anonimken (giriş ekranında) yapılan seçim girişten sonra hesaba taşınır ve DB'ye yazılır.
 *  - Sahipsiz eski kayıt (bu değişiklikten önceki seçimler) bir kez hesaba taşınır; eskiden
 *    başlıktaki mobil dil düğmesi DB'ye yazmıyordu, o kullanıcılar dilini kaybetmesin.
 *  - `setLocale` dili hem cihaza (çerez + localStorage) hem hesaba (PATCH /api/user/profile +
 *    oturum güncellemesi) yazar; çağıranlar ayrıca kalıcılaştırmak zorunda değil.
 *
 * Segment sınırı (`AppLocaleBoundary`): sunucunun çerezden bildiği dil ve gerekiyorsa EN
 * kataloğu sunucu layout'undan gelir → istemci bileşenleri SSR'da DOĞRU dilde basılır (eskiden
 * hep TR basılıp hidrasyondan sonra EN'e sıçrıyordu). Sınır, kök sağlayıcının kararını izler;
 * karar sunucunun bastığı dilden farklıysa sayfayı sunucuda yeniden çizer (`router.refresh`).
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

type SetLocaleOptions = {
  /** false: çağıran DB'ye zaten yazdı (ör. ayarlar formu) — yalnız cihaz + arayüz değişir. */
  persist?: boolean;
};

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale, options?: SetLocaleOptions) => void;
  /** Katalog inince artar → bağlam tüketicileri (useAppT) yeni dille yeniden çizilir. */
  catalogVersion: number;
  /** Kök sağlayıcı oturum/cihaz tercihini çözdü mü (sınırlar ancak bundan sonra izler). */
  resolved: boolean;
};

const AppLocaleContext = createContext<LocaleContextValue | null>(null);

function normalizeLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : defaultLocale;
}

type StoredChoice = { locale: Locale; owner: string | null };

/** Cihazdaki açık seçim. `owner`: seçimi yapan kullanıcı ('' = anonim, null = eski sahipsiz kayıt). */
function readStoredChoice(): StoredChoice | null {
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw !== 'tr' && raw !== 'en') return null;
    return { locale: raw, owner: window.localStorage.getItem(LOCALE_OWNER_STORAGE_KEY) };
  } catch {
    return null;
  }
}

function writeStoredChoice(locale: Locale, owner: string) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.localStorage.setItem(LOCALE_OWNER_STORAGE_KEY, owner);
  } catch {
    /* depolama kapalı: çerez yine yazılır */
  }
}

/**
 * Çözüm kuralı (saf; jest: __tests__/i18n/locale-resolution.test.ts).
 * `persist`: seçimin hesaba yazılması gerekiyor (anonim/eski seçim girişten sonra taşınıyor).
 */
export function resolveLocaleChoice(input: {
  userId: string | null;
  sessionLocale: Locale | null;
  stored: StoredChoice | null;
  cookie: Locale | null;
  fallback: Locale;
}): { locale: Locale; persist: boolean } {
  const { userId, sessionLocale, stored, cookie, fallback } = input;
  if (userId) {
    if (stored && (stored.owner === '' || stored.owner === null)) {
      return { locale: stored.locale, persist: stored.locale !== sessionLocale };
    }
    return { locale: sessionLocale ?? fallback, persist: false };
  }
  return { locale: stored?.locale ?? cookie ?? fallback, persist: false };
}

async function persistAccountLocale(
  locale: Locale,
  update: ((data?: unknown) => Promise<unknown>) | undefined
): Promise<void> {
  try {
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ preferredLanguage: locale }),
    });
    if (!res.ok) return;
    await update?.({ preferredLanguage: locale });
  } catch {
    // Ağ yok: arayüz ve cihaz seçimi değişti; hesap tercihi bir sonraki seçimde yazılır.
  }
}

type ProviderProps = {
  children: ReactNode;
  /** Segment sınırı: sunucunun bastığı dil (çerez). Yalnız `AppLocaleBoundary` verir. */
  initialLocale?: Locale;
  /** Segment sınırı: `initialLocale` için katalog (yalnız EN; TR zaten pakette). */
  initialMessages?: MessageTree;
  /** Segment sınırı: kök karar sunucunun bastığı dilden farklı → sunucu bileşenlerini yenile. */
  onServerLocaleStale?: () => void;
};

export function AppLocaleProvider({ children, initialLocale, initialMessages, onServerLocaleStale }: ProviderProps) {
  const parent = useContext(AppLocaleContext);
  // Sunucudan gelen katalog SSR ve hidrasyonda senkron hazır olmalı (render içinde, idempotent).
  if (initialLocale && initialMessages && !catalogs[initialLocale]) {
    catalogs[initialLocale] = initialMessages;
  }
  return parent ? (
    <BoundaryLocaleProvider parent={parent} initialLocale={initialLocale} onServerLocaleStale={onServerLocaleStale}>
      {children}
    </BoundaryLocaleProvider>
  ) : (
    <RootLocaleProvider initialLocale={initialLocale}>{children}</RootLocaleProvider>
  );
}

function useCatalogVersion(locale: Locale): number {
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    if (catalogs[locale]) return;
    let cancelled = false;
    void loadCatalog(locale).then(() => {
      if (!cancelled && catalogs[locale]) setCatalogVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);
  return catalogVersion;
}

function RootLocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const sessionCtx = useSession();
  const { data: session, status } = sessionCtx;
  const update = (sessionCtx as { update?: (data?: unknown) => Promise<unknown> }).update;
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? defaultLocale);
  const [resolved, setResolved] = useState(false);
  const catalogVersion = useCatalogVersion(locale);

  const user = session?.user as { id?: string; preferredLanguage?: string } | undefined;
  const userId = user?.id ?? null;
  const sessionLocale = user ? normalizeLocale(user.preferredLanguage) : null;
  // Olay işleyicileri (setLocale) en güncel oturumu okusun; ref yazımı render dışında.
  const updateRef = useRef(update);
  const userIdRef = useRef(userId);
  const sessionLocaleRef = useRef(sessionLocale);
  useEffect(() => {
    updateRef.current = update;
    userIdRef.current = userId;
    sessionLocaleRef.current = sessionLocale;
  });

  useEffect(() => {
    if (status === 'loading') return;
    const decision = resolveLocaleChoice({
      userId,
      sessionLocale,
      stored: readStoredChoice(),
      cookie: readLocaleCookieClient(),
      fallback: initialLocale ?? defaultLocale,
    });
    setLocaleState(decision.locale);
    writeLocaleCookieClient(decision.locale);
    if (userId) writeStoredChoice(decision.locale, userId);
    if (decision.persist) void persistAccountLocale(decision.locale, updateRef.current);
    setResolved(true);
    // initialLocale yalnız ilk karar için; sonradan değişmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId, sessionLocale]);

  useEffect(() => {
    // Sunucu `<html lang>`'i sabit basar; ilk boyamadan önce head betiği çerezden düzeltir
    // (app/layout.tsx). Karar çözülünce buradan izlenir — ekran okuyucu doğru telaffuz eder.
    if (resolved) document.documentElement.lang = locale;
  }, [locale, resolved]);

  const setLocale = useCallback((next: Locale, options?: SetLocaleOptions) => {
    const normalized = normalizeLocale(next);
    setLocaleState(normalized);
    const owner = userIdRef.current ?? '';
    writeStoredChoice(normalized, owner);
    writeLocaleCookieClient(normalized);
    if (userIdRef.current && options?.persist !== false && normalized !== sessionLocaleRef.current) {
      void persistAccountLocale(normalized, updateRef.current);
    }
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, catalogVersion, resolved }),
    [locale, setLocale, catalogVersion, resolved]
  );
  return <AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>;
}

function BoundaryLocaleProvider({
  children,
  parent,
  initialLocale,
  onServerLocaleStale,
}: {
  children: ReactNode;
  parent: LocaleContextValue;
  initialLocale?: Locale;
  onServerLocaleStale?: () => void;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? parent.locale);
  const catalogVersion = useCatalogVersion(locale);
  const serverLocaleRef = useRef<Locale>(initialLocale ?? parent.locale);
  const staleRef = useRef(onServerLocaleStale);
  useEffect(() => {
    staleRef.current = onServerLocaleStale;
  });

  useEffect(() => {
    // Kök karar vermeden önce sunucunun bastığı dil korunur (aksi hâlde EN sayfa bir an TR olurdu).
    if (!parent.resolved) return;
    setLocaleState(parent.locale);
    if (parent.locale !== serverLocaleRef.current) {
      serverLocaleRef.current = parent.locale;
      // Çerez kök tarafından yazıldı; sunucu bileşenleri (metadata, RSC metinleri) yeni dille.
      staleRef.current?.();
    }
  }, [parent.locale, parent.resolved]);

  const value = useMemo(
    () => ({ locale, setLocale: parent.setLocale, catalogVersion, resolved: parent.resolved }),
    [locale, parent.setLocale, catalogVersion, parent.resolved]
  );
  return <AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>;
}

/**
 * Segment layout'larının sarmalayıcısı (istemci tarafı). Sunucu layout'u `ServerLocaleBoundary`
 * (lib/server-locale-boundary.tsx) üzerinden çağırır; sunucu çerezinden dili ve EN kataloğunu verir.
 */
export function AppLocaleBoundary({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages?: MessageTree;
  children: ReactNode;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  return (
    <AppLocaleProvider initialLocale={locale} initialMessages={messages} onServerLocaleStale={refresh}>
      {children}
    </AppLocaleProvider>
  );
}

export function useAppLocale() {
  const ctx = useContext(AppLocaleContext);
  if (!ctx) throw new Error('useAppLocale must be used within AppLocaleProvider');
  return ctx;
}

/**
 * Sağlayıcı dışında da çalışan dil okuyucu (temel UI primitive'leri, izole test/önizleme):
 * sağlayıcı yoksa varsayılan dil. Kanca koşulsuz çağrılır.
 */
export function useLocaleSafe(): Locale {
  return useContext(AppLocaleContext)?.locale ?? defaultLocale;
}

/** Arayüz dilinde sayı/para/tarih/göreli zaman/çoğul biçimleyiciler (B11; sağlayıcı dışında TR). */
export function useFormatters(): Formatters {
  return getFormatters(useLocaleSafe());
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
