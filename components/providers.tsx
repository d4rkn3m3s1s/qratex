'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { InstallBanner } from '@/components/pwa/install-banner';

interface ProvidersProps {
  children: ReactNode;
}

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

// Custom colors type
interface CustomColors {
  primary?: string;
  secondary?: string;
  accent?: string;
}

// Theme color presets
const themePresets: Record<string, { primary: string; secondary: string; accent: string }> = {
  purple: { primary: '#8B5CF6', secondary: '#A855F7', accent: '#F472B6' },
  blue: { primary: '#3B82F6', secondary: '#06B6D4', accent: '#22D3EE' },
  green: { primary: '#22C55E', secondary: '#10B981', accent: '#34D399' },
  orange: { primary: '#F97316', secondary: '#FB923C', accent: '#FBBF24' },
  pink: { primary: '#EC4899', secondary: '#F472B6', accent: '#F9A8D4' },
  light: { primary: '#7C3AED', secondary: '#8B5CF6', accent: '#A78BFA' },
};

function ThemeColorsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const applyThemeColors = async () => {
      try {
        // Use public theme endpoint instead of admin endpoint
        const res = await fetch('/api/settings/theme');
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.raw && Array.isArray(data.raw)) {
          const settings = data.raw as Array<{ key: string; value: unknown }>;
          const root = document.documentElement;
          
          // Find active theme
          const themeSettings = settings.find(s => s.key === 'activeTheme');
          const activeThemeId = themeSettings?.value as string | undefined;
          
          // Apply preset theme first
          if (activeThemeId && themePresets[activeThemeId]) {
            const preset = themePresets[activeThemeId];
            root.style.setProperty('--primary', hexToHSL(preset.primary));
            root.style.setProperty('--ring', hexToHSL(preset.primary));
            root.style.setProperty('--gradient-from', hexToHSL(preset.primary));
            root.style.setProperty('--gradient-to', hexToHSL(preset.secondary));
            root.style.setProperty('--accent', hexToHSL(preset.accent));
          }
          
          // Find and apply custom colors
          const customColorsSetting = settings.find(s => s.key === 'customColors');
          if (customColorsSetting?.value) {
            const colors = customColorsSetting.value as CustomColors;
            if (colors.primary) {
              root.style.setProperty('--primary', hexToHSL(colors.primary));
              root.style.setProperty('--ring', hexToHSL(colors.primary));
              root.style.setProperty('--gradient-from', hexToHSL(colors.primary));
            }
            if (colors.secondary) {
              root.style.setProperty('--gradient-to', hexToHSL(colors.secondary));
            }
            if (colors.accent) {
              root.style.setProperty('--accent', hexToHSL(colors.accent));
            }
          }
        }
      } catch (error) {
        console.error('Failed to load theme:', error);
      }
    };
    
    applyThemeColors();
  }, []);
  
  return <>{children}</>;
}

export function Providers({ children }: ProvidersProps) {
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
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          storageKey="qratex-theme"
        >
          <ThemeColorsProvider>
            {children}
            <InstallBanner />
          </ThemeColorsProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
