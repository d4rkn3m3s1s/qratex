/**
 * Lightweight i18n utility for QRATEX.
 * Loads TR/EN dictionaries and provides a translation hook.
 * Install `next-intl` for full App Router i18n support later.
 */

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

export const locales = ['tr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'tr';

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
    const parts = key.split('.');
    let current: unknown = messageSets[locale] ?? messageSets[defaultLocale];
    
    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part];
        } else {
            return key; // fallback to key if not found
        }
    }
    
    if (typeof current !== 'string') return key;
    
    let result = current;
    if (variables) {
        Object.entries(variables).forEach(([k, v]) => {
            result = result.replace(new RegExp(`{${k}}`, 'g'), String(v));
        });
    }
    
    return result;
}
