/**
 * QRATEX i18n — SUNUCU tarafı katalog erişimi (iki dilin tam sözlüğü).
 *
 * Sunucu bileşenleri, metadata üreticileri ve route-loading ekranları buradan `t()` kullanır.
 * İstemci bileşenleri buraya DEĞİL `lib/app-locale.tsx` (`useAppT`) üzerinden çevirir: orada
 * yalnız varsayılan dil (TR) pakete girer, EN yalnız seçilince ayrı parça olarak iner (perf Y1).
 * Bu dosyayı bir `'use client'` modülünden içe aktarmak iki dilin tamamını her sayfanın ortak
 * paketine geri sokar — `__tests__/architecture/perf-bundle-guards.test.ts` bunu engeller.
 */

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';
import { defaultLocale, translate, type Locale, type MessageTree } from './core';

export { locales, defaultLocale, type Locale } from './core';

type Messages = typeof trMessages;
const messageSets: Record<Locale, Messages> = { tr: trMessages, en: enMessages };

/**
 * Get messages for a given locale.
 */
export function getMessages(locale: Locale = defaultLocale): Messages {
  return messageSets[locale] ?? messageSets[defaultLocale];
}

/**
 * Get a translation value by dot-path key, e.g. 'common.save'.
 * Supports simple variable replacement: t('key', { name: 'John' }) replaces {name}.
 */
export function t(locale: Locale, key: string, variables?: Record<string, string | number>): string {
  return translate((messageSets[locale] ?? messageSets[defaultLocale]) as MessageTree, key, variables);
}
