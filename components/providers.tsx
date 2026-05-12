'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider, useTheme } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { useState, useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { InstallBanner } from '@/components/pwa/install-banner';
import { applyRuntimeThemeToRoot, type RuntimeThemeHex } from '@/lib/apply-runtime-theme';
import { THEME_COLOR_PRESETS, getAdminThemePresetsBase, type ThemePresetId } from '@/lib/theme-presets';
import {
  THEME_SETTINGS_KEYS,
  THEME_SETTINGS_PUBLIC_API_PATH,
  type ThemeSettingRow,
} from '@/lib/theme-settings-keys';
import { AppLocaleProvider } from '@/lib/app-locale';

interface ProvidersProps {
  children: ReactNode;
  /** SSR’den gelen satırlar — palet ilk boyamada hazır olur (client fetch gecikmesi olmaz). */
  initialThemeSettings?: ThemeSettingRow[];
}

function parseThemeRowsToState(settings: ThemeSettingRow[]) {
  const themeSettings = settings.find((s) => s.key === THEME_SETTINGS_KEYS.activeTheme);
  const nextThemeId = themeSettings?.value;
  const customColorsSetting = settings.find((s) => s.key === THEME_SETTINGS_KEYS.customColors);
  return {
    activeThemeId: typeof nextThemeId === 'string' ? nextThemeId : null,
    customColors: customColorsSetting?.value ? (customColorsSetting.value as RuntimeThemeHex) : null,
  };
}

function resolveColorMode(root: HTMLElement, resolvedTheme: string | undefined): 'light' | 'dark' {
  if (resolvedTheme === 'dark') return 'dark';
  if (resolvedTheme === 'light') return 'light';
  return root.classList.contains('dark') ? 'dark' : 'light';
}

const themePresets = THEME_COLOR_PRESETS;
const themePresetRows = getAdminThemePresetsBase();
const themePresetRowMap = new Map(themePresetRows.map((row) => [row.id, row]));

function getThemeFamilyKey(themeId: string): string {
  return themeId.replace(/Light$/i, '');
}

function resolveThemeIdForMode(
  themeId: string,
  mode: 'light' | 'dark',
  presets: Record<string, RuntimeThemeHex>
): string {
  const family = getThemeFamilyKey(themeId);
  const preferred = mode === 'light' ? `${family}Light` : family;
  if (preferred in presets) return preferred;
  if (themeId in presets) return themeId;
  return 'purple';
}

function ThemeColorsProvider({
  children,
  initialThemeSettings,
}: {
  children: ReactNode;
  initialThemeSettings?: ThemeSettingRow[];
}) {
  const { resolvedTheme } = useTheme();
  const boot = useMemo(() => {
    if (!initialThemeSettings?.length) {
      return { activeThemeId: null as string | null, customColors: null as RuntimeThemeHex | null };
    }
    return parseThemeRowsToState(initialThemeSettings);
  }, [initialThemeSettings]);

  const [isThemeInitialized, setIsThemeInitialized] = useState(!!initialThemeSettings?.length);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(boot.activeThemeId);
  const [customColors, setCustomColors] = useState<RuntimeThemeHex | null>(boot.customColors);

  const loadThemeSettings = async () => {
    try {
      const res = await fetch(THEME_SETTINGS_PUBLIC_API_PATH, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      if (data.raw && Array.isArray(data.raw)) {
        const settings = data.raw as ThemeSettingRow[];
        const parsed = parseThemeRowsToState(settings);
        setActiveThemeId(parsed.activeThemeId);
        setCustomColors(parsed.customColors);
        setIsThemeInitialized(true);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
  };

  // Sunucudan gelen paletle hizalı kalsın diye mount’ta bir kez yenile.
  useEffect(() => {
    void loadThemeSettings();
  }, []);

  useEffect(() => {
    const onPaletteChanged = () => {
      void loadThemeSettings();
    };
    const onPalettePreview = (event: Event) => {
      const custom = event as CustomEvent<{
        colors?: RuntimeThemeHex;
        mode?: 'light' | 'dark';
        activeThemeId?: string;
      }>;
      if (!custom.detail?.colors) return;
      const root = document.documentElement;
      const mode: 'light' | 'dark' =
        custom.detail.mode ?? (root.classList.contains('dark') ? 'dark' : 'light');
      applyRuntimeThemeToRoot({ ...custom.detail.colors, mode }, root);
      if (custom.detail.activeThemeId) setActiveThemeId(custom.detail.activeThemeId);
      if (custom.detail.activeThemeId === 'custom') setCustomColors(custom.detail.colors);
    };
    window.addEventListener('qratex:theme-palette-changed', onPaletteChanged as EventListener);
    window.addEventListener('qratex:theme-palette-preview', onPalettePreview as EventListener);
    return () => {
      window.removeEventListener('qratex:theme-palette-changed', onPaletteChanged as EventListener);
      window.removeEventListener('qratex:theme-palette-preview', onPalettePreview as EventListener);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isThemeInitialized) return;
    const root = document.documentElement;
    const mode = resolveColorMode(root, resolvedTheme);

    if (activeThemeId === 'custom' && customColors) {
      applyRuntimeThemeToRoot(
        {
          primary: customColors.primary,
          secondary: customColors.secondary,
          accent: customColors.accent,
          background: customColors.background,
          foreground: customColors.foreground,
          mode,
        },
        root
      );
      return;
    }

    if (activeThemeId && activeThemeId in themePresets) {
      const effectiveThemeId = resolveThemeIdForMode(activeThemeId, mode, themePresets);
      const preset = themePresets[effectiveThemeId as ThemePresetId];
      const presetRow = themePresetRowMap.get(effectiveThemeId as ThemePresetId);
      applyRuntimeThemeToRoot(
        {
          primary: preset.primary,
          secondary: preset.secondary,
          accent: preset.accent,
          background: presetRow?.colors.background,
          foreground: presetRow?.colors.foreground,
          mode,
        },
        root
      );
    }
  }, [activeThemeId, customColors, isThemeInitialized, resolvedTheme]);

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

export function Providers({ children, initialThemeSettings }: ProvidersProps) {
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
    <SessionProvider>
      <AppLocaleProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="qratex-theme"
            themes={['light', 'dark', 'system']}
            disableTransitionOnChange
            enableColorScheme
          >
            <MotionConfig reducedMotion="user">
              <ThemeModeSync />
              <ThemeColorsProvider initialThemeSettings={initialThemeSettings}>
                {children}
                <InstallBanner />
              </ThemeColorsProvider>
            </MotionConfig>
          </ThemeProvider>
        </QueryClientProvider>
      </AppLocaleProvider>
    </SessionProvider>
  );
}
