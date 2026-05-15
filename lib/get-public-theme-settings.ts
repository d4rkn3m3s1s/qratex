import 'server-only';

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  THEME_SETTINGS_CATEGORY,
  PUBLIC_THEME_SETTINGS_CACHE_TAG,
  type ThemeSettingRow,
} from '@/lib/theme-settings-keys';

const REVALIDATE_SECONDS = 120;

async function loadThemeRowsFromDb(): Promise<ThemeSettingRow[]> {
  try {
    return await prisma.settings.findMany({
      where: { category: THEME_SETTINGS_CATEGORY },
      select: { key: true, value: true },
    });
  } catch {
    return [];
  }
}

const getCachedThemeRows = unstable_cache(
  loadThemeRowsFromDb,
  ['public-theme-settings-rows'],
  {
    revalidate: REVALIDATE_SECONDS,
    tags: [PUBLIC_THEME_SETTINGS_CACHE_TAG],
  },
);

async function getPublicThemeSettingsImpl(): Promise<ThemeSettingRow[]> {
  return getCachedThemeRows();
}

/**
 * Server-side theme rows for SSR (avoids palette flash before client fetch).
 * Kısa süreli önbellek; admin tema kaydında `revalidatePublicThemeSettings()` ile yenilenir.
 * Aynı RSC isteğinde tek `unstable_cache` çağrısı.
 */
export const getPublicThemeSettings = cache(getPublicThemeSettingsImpl);
