/**
 * Sözlükten bağımsız i18n çekirdeği: dil listesi, tipler ve saf çözümleyici.
 *
 * Bu modül HİÇBİR sözlük JSON'u içe aktarmaz; böylece istemci tarafı (`lib/app-locale.tsx`)
 * dili ve çözümleyiciyi iki dilin tam kataloğunu pakete sokmadan kullanabilir (perf Y1).
 * Sunucu tarafı (`i18n/request.ts`) aynı çözümleyiciyi iki katalogla çağırır.
 */

export const locales = ['tr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'tr';

/** İç içe anahtar ağacı (`messages/*.json` biçimi). */
export type MessageTree = { readonly [key: string]: unknown };

/**
 * Nokta yollu anahtarı çözer (`'common.save'`); `{name}` biçimli değişkenleri doldurur.
 * Anahtar yoksa ya da yaprak metin değilse anahtarın kendisi döner (eski davranış).
 */
export function translate(
  messages: MessageTree | undefined,
  key: string,
  variables?: Record<string, string | number>
): string {
  let current: unknown = messages;
  for (const part of key.split('.')) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  if (typeof current !== 'string') return key;

  let result = current;
  if (variables) {
    for (const [k, v] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{${k}}`, 'g'), String(v));
    }
  }
  return result;
}
