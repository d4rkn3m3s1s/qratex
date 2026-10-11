import type { Locale } from '@/i18n/core';

/** Synced with client localStorage + cookie for SSR metadata */
export const LOCALE_STORAGE_KEY = 'qratex-locale';
export const LOCALE_COOKIE_NAME = 'qratex-locale';
/**
 * Cihazdaki dil seçimini kimin yaptığı (kullanıcı kimliği; anonimse boş dize). Paylaşılan
 * cihazda önceki kullanıcının seçimi yeni kullanıcının hesap tercihini ezmesin (B2).
 */
export const LOCALE_OWNER_STORAGE_KEY = 'qratex-locale-owner';

/** Keeps `document.cookie` aligned so dashboard layouts get correct tab titles on navigation. */
export function writeLocaleCookieClient(locale: Locale) {
  if (typeof document === 'undefined') return;
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** Çerezdeki dil (yoksa null). */
export function readLocaleCookieClient(): Locale | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)qratex-locale=(tr|en)(?:;|$)/);
  return match ? (match[1] as Locale) : null;
}

/**
 * `<head>` içinde ilk boyamadan önce çalışan satır içi betik parçası: `<html lang>`'i çerezdeki
 * dile çeker. Sunucu kök layout'u statik kalabilsin diye `lang="tr"` basar (blog/yasal sayfalar
 * statik üretilir); EN kullanıcının ekran okuyucusu ilk boyamadan itibaren İngilizce telaffuz eder.
 */
export const LOCALE_LANG_INIT_SNIPPET = `try{var lm=document.cookie.match(/(?:^|;\\s*)${LOCALE_COOKIE_NAME}=(tr|en)(?:;|$)/);if(lm)document.documentElement.lang=lm[1];}catch(e){}`;
