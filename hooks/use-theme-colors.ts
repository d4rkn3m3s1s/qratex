'use client';

import { useEffect, useState } from 'react';

// HEX to HSL conversion
function hexToHSL(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 0%';

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background?: string;
  foreground?: string;
}

export function useThemeColors() {
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [customColors, setCustomColors] = useState<ThemeColors | null>(null);

  const applyTheme = (colors: ThemeColors) => {
    const root = document.documentElement;
    
    if (colors.primary) {
      const primaryHSL = hexToHSL(colors.primary);
      root.style.setProperty('--primary', primaryHSL);
      root.style.setProperty('--ring', primaryHSL);
      root.style.setProperty('--gradient-from', primaryHSL);
    }
    
    if (colors.secondary) {
      const secondaryHSL = hexToHSL(colors.secondary);
      root.style.setProperty('--gradient-to', secondaryHSL);
    }
    
    if (colors.accent) {
      const accentHSL = hexToHSL(colors.accent);
      root.style.setProperty('--accent', accentHSL);
    }
    
    if (colors.background) {
      const bgHSL = hexToHSL(colors.background);
      root.style.setProperty('--background', bgHSL);
    }
    
    if (colors.foreground) {
      const fgHSL = hexToHSL(colors.foreground);
      root.style.setProperty('--foreground', fgHSL);
    }
  };

  const fetchAndApplyTheme = async () => {
    try {
      const res = await fetch('/api/settings/theme');
      if (!res.ok) return;
      const data = await res.json();
      
      if (data.raw && Array.isArray(data.raw)) {
        const settings = data.raw as Array<{ key: string; value: unknown }>;
        
        // Find theme settings
        const themeSetting = settings.find(s => s.key === 'activeTheme');
        const colorsSetting = settings.find(s => s.key === 'customColors');
        
        const themeId = themeSetting?.value as string | undefined;
        
        if (themeId) {
          setActiveTheme(themeId);
          
          // Apply preset theme colors
          const presetThemes: Record<string, ThemeColors> = {
            purple: { primary: '#8B5CF6', secondary: '#A855F7', accent: '#F472B6' },
            blue: { primary: '#3B82F6', secondary: '#06B6D4', accent: '#22D3EE' },
            green: { primary: '#22C55E', secondary: '#10B981', accent: '#34D399' },
            orange: { primary: '#F97316', secondary: '#FB923C', accent: '#FBBF24' },
            pink: { primary: '#EC4899', secondary: '#F472B6', accent: '#F9A8D4' },
            light: { primary: '#7C3AED', secondary: '#8B5CF6', accent: '#A78BFA' },
          };
          
          if (presetThemes[themeId]) {
            applyTheme(presetThemes[themeId]);
          }
        }
        
        if (colorsSetting?.value) {
          const colors = colorsSetting.value as ThemeColors;
          setCustomColors(colors);
          // Custom colors override preset if exists
          if (colors.primary || colors.secondary || colors.accent) {
            applyTheme(colors);
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
