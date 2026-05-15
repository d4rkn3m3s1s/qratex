import { cache } from 'react';
import { cookies } from 'next/headers';
import { defaultLocale, type Locale } from '@/i18n/request';
import { LOCALE_COOKIE_NAME } from '@/lib/locale-shared';

async function getServerLocaleImpl(): Promise<Locale> {
  try {
    const jar = await cookies();
    const raw = jar.get(LOCALE_COOKIE_NAME)?.value;
    return raw === 'en' ? 'en' : defaultLocale;
  } catch {
    return defaultLocale;
  }
}

/**
 * Locale from cookie (set when user switches language in-app).
 * Falls back to defaultLocale when cookie is absent (first visit / bots).
 * Aynı RSC isteğinde `cookies()` tek okunur.
 */
export const getServerLocale = cache(getServerLocaleImpl);
