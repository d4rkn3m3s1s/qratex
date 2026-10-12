'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider, useTheme } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion } from 'framer-motion';
import { MotionPolicyConfig } from '@/lib/motion/motion-policy-config';
import { useState, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { InstallBanner } from '@/components/pwa/install-banner';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { SessionDeviceGuard } from '@/components/customer/p-kart-masa-offline/offline/session-device-guard';
import { applyRuntimeThemeCss } from '@/lib/apply-runtime-theme';
// Palet kataloğu (theme-runtime → theme-model) ilk yük JS'inde değil: SSR aynı CSS'i zaten
// basıyor; istemci yalnız değişiklikte (yayın, dönemsel konsept) tembel modülle yeniden yazar.
const loadThemeRuntime = () => import('@/lib/design-system/theme-runtime');
import {
  THEME_SETTINGS_KEYS,
  THEME_SETTINGS_PUBLIC_API_PATH,
  type ThemeSettingRow,
} from '@/lib/theme-settings-keys';
import { AppLocaleProvider } from '@/lib/app-locale';
import { ConfettiProvider } from '@/components/providers/confetti-provider';
import { AccessibilityClassSync } from '@/components/accessibility-class-sync';
import { SeasonalConceptApplier } from '@/components/seasonal/seasonal-concept-applier';
import { readSeasonalOverride, subscribeSeasonalOverride } from '@/lib/seasonal-concept-events';

const loadDomAnimation = () => import('@/lib/motion/dom-animation').then((mod) => mod.default);

interface ProvidersProps {
  children: ReactNode;
  /** SSR’den gelen satırlar — palet ilk boyamada hazır olur (client fetch gecikmesi olmaz). */
  initialThemeSettings?: ThemeSettingRow[];
}

function ThemeColorsProvider({
  children,
  initialThemeSettings,
}: {
  children: ReactNode;
  initialThemeSettings?: ThemeSettingRow[];
}) {
  // SSR satırları varsa durum hazır başlar (aynı CSS zaten app/layout.tsx'te basıldı).
  const [isThemeInitialized, setIsThemeInitialized] = useState(!!initialThemeSettings?.length);
  const [themeRows, setThemeRows] = useState<ThemeSettingRow[] | undefined>(initialThemeSettings);
  // Aktif dönemsel konseptin paleti: tema hesaplamasında üst katman (aynı türetme, iki mod).
  const [seasonalThemeId, setSeasonalThemeId] = useState<string | null>(null);
  useEffect(() => {
    setSeasonalThemeId(readSeasonalOverride().themePresetId);
    return subscribeSeasonalOverride((o) => setSeasonalThemeId(o.themePresetId));
  }, []);

  const applyRows = (rows: ThemeSettingRow[]) => {
    setThemeRows(rows);
    setIsThemeInitialized(true);
  };

  const loadThemeSettings = async (opts?: { bypassCache?: boolean }) => {
    try {
      const res = await fetch(
        THEME_SETTINGS_PUBLIC_API_PATH,
        opts?.bypassCache
          ? { cache: 'no-store' }
          : { next: { revalidate: 60 } }
      );
      if (!res.ok) return;
      const data = await res.json();

      const themeRows = Array.isArray(data.entries)
        ? (data.entries as ThemeSettingRow[])
        : Array.isArray(data.raw)
          ? (data.raw as ThemeSettingRow[])
          : [];
      if (themeRows.length > 0) applyRows(themeRows);
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
  };

  // Sunucudan gelen paletle hizalı kalsın diye mount’ta bir kez yenile.
  useEffect(() => {
    void loadThemeSettings();
  }, []);

  useEffect(() => {
    const onPaletteChanged = (event: Event) => {
      // Yayın yanıtı yeni satırları taşıyorsa doğrudan uygula (kendi yazdığını okuma garantisi;
      // ikinci okuma önbellekten eski satırı getirip yeni paleti ezmesin). Yoksa yeniden oku.
      const rows = (event as CustomEvent<{ entries?: ThemeSettingRow[] }>).detail?.entries;
      if (Array.isArray(rows)) {
        applyRows(rows);
        return;
      }
      void loadThemeSettings({ bypassCache: true });
    };
    window.addEventListener('qratex:theme-palette-changed', onPaletteChanged as EventListener);
    return () => {
      window.removeEventListener('qratex:theme-palette-changed', onPaletteChanged as EventListener);
    };
  }, []);

  // Tek yazar: iki modun bloğu birlikte (lib/design-system/theme-runtime). Mod değişiminde
  // yeniden hesap/boyama yok; erişilebilirlik modları seçici özgüllüğüyle her zaman üstte.
  useEffect(() => {
    if (!isThemeInitialized && !seasonalThemeId) return;
    let cancelled = false;
    void loadThemeRuntime().then(({ buildRuntimeThemeCss, runtimeThemeStateFromRows }) => {
      if (cancelled) return;
      applyRuntimeThemeCss(buildRuntimeThemeCss({ ...runtimeThemeStateFromRows(themeRows), seasonalThemeId }));
    });
    return () => {
      cancelled = true;
    };
  }, [themeRows, isThemeInitialized, seasonalThemeId]);

  return <>{children}</>;
}

function ThemeModeSync() {
  const { resolvedTheme } = useTheme();

  useLayoutEffect(() => {
    if (!resolvedTheme) return;
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    root.setAttribute('data-theme', resolvedTheme);
    root.style.colorScheme = resolvedTheme;
    if (body) {
      body.classList.remove('light', 'dark');
      body.classList.add(resolvedTheme);
      body.setAttribute('data-theme', resolvedTheme);
      body.style.colorScheme = resolvedTheme;
    }
  }, [resolvedTheme]);

  return null;
}

/** Platform varsayılan modu (Tasarım Sistemi → Temalar). Kullanıcının kendi seçimi (`qratex-theme`) her zaman önce gelir. */
function readDefaultMode(rows?: ThemeSettingRow[]): 'system' | 'light' | 'dark' {
  const v = rows?.find((r) => r.key === THEME_SETTINGS_KEYS.defaultMode)?.value;
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function Providers({ children, initialThemeSettings }: ProvidersProps) {
  const defaultMode = readDefaultMode(initialThemeSettings);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus>
      <AppLocaleProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            attribute="class"
            defaultTheme={defaultMode}
            enableSystem
            storageKey="qratex-theme"
            themes={['light', 'dark', 'system']}
            disableTransitionOnChange
            enableColorScheme
          >
            {/* Tek hareket politikası: OS prefers-reduced-motion VEYA uygulama ayarı (html.reduce-animations). */}
            <MotionPolicyConfig>
              <ThemeModeSync />
              <AccessibilityClassSync />
              <SeasonalConceptApplier />
              <ThemeColorsProvider initialThemeSettings={initialThemeSettings}>
                <ConfettiProvider>
                  {/* GLOBAL LazyMotion (non-strict): tüm sayfalarda `m.` bileşenleri
                      per-sayfa sarmal olmadan çalışır → framer-motion bundle'ı ertelenir.
                      Non-strict olduğu için çevrilmemiş `motion.` de çalışmaya devam eder.
                      Özellik paketi tembel (lib/motion/dom-animation): ilk JS'e girmez. */}
                  <LazyMotion features={loadDomAnimation}>
                    {children}
                    <InstallBanner />
                    <OfflineBanner />
                    {/* Paylaşılan cihaz: kullanıcı değişince/çıkışta kişisel SW önbellekleri ve
                        çevrimdışı kart görüntüleri silinir (çevrimdışı rapor bulgu 2). */}
                    <SessionDeviceGuard />
                  </LazyMotion>
                </ConfettiProvider>
              </ThemeColorsProvider>
            </MotionPolicyConfig>
          </ThemeProvider>
        </QueryClientProvider>
      </AppLocaleProvider>
    </SessionProvider>
  );
}
