'use client';

import { useEffect, useState } from 'react';
import { applyRuntimeThemeToRoot, type RuntimeThemeHex } from '@/lib/apply-runtime-theme';
import { THEME_COLOR_PRESETS } from '@/lib/theme-presets';
import { THEME_SETTINGS_KEYS, THEME_SETTINGS_PUBLIC_API_PATH } from '@/lib/theme-settings-keys';

export function useThemeColors() {
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [customColors, setCustomColors] = useState<RuntimeThemeHex | null>(null);

  const applyTheme = (colors: RuntimeThemeHex) => {
    applyRuntimeThemeToRoot(colors);
  };

  const fetchAndApplyTheme = async () => {
    try {
      const res = await fetch(THEME_SETTINGS_PUBLIC_API_PATH);
      if (!res.ok) return;
      const data = await res.json();
      
      if (data.raw && Array.isArray(data.raw)) {
        const settings = data.raw as Array<{ key: string; value: unknown }>;
        
        // Find theme settings
        const themeSetting = settings.find((s) => s.key === THEME_SETTINGS_KEYS.activeTheme);
        const colorsSetting = settings.find((s) => s.key === THEME_SETTINGS_KEYS.customColors);
        
        const themeId = themeSetting?.value as string | undefined;
        
        if (themeId) {
          setActiveTheme(themeId);
          
          // Apply preset theme colors
          const presetThemes: Record<string, RuntimeThemeHex> = THEME_COLOR_PRESETS;
          
          if (presetThemes[themeId]) {
            applyTheme(presetThemes[themeId]);
          }
        }
        
        if (themeId === 'custom' && colorsSetting?.value) {
          const colors = colorsSetting.value as RuntimeThemeHex;
          setCustomColors(colors);
          // Custom colors only override when active theme is custom
          if (colors.primary || colors.secondary || colors.accent) {
            applyTheme({
              primary: colors.primary,
              secondary: colors.secondary,
              accent: colors.accent,
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch theme:', error);
    }
  };

  useEffect(() => {
    fetchAndApplyTheme();
  }, []);

  return { activeTheme, customColors, applyTheme, refetch: fetchAndApplyTheme };
}

