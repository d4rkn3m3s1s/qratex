import type { Locale } from '@/i18n/request';

/** Synced with client localStorage + cookie for SSR metadata */
export const LOCALE_STORAGE_KEY = 'qratex-locale';
export const LOCALE_COOKIE_NAME = 'qratex-locale';

/** Keeps `document.cookie` aligned so dashboard layouts get correct tab titles on navigation. */
export function writeLocaleCookieClient(locale: Locale) {
  if (typeof document === 'undefined') return;
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${maxAge}; SameSite=Lax`;
}
