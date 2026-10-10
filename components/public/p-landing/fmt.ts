/**
 * `{ad}` yer tutuculu metin doldurucu. Kopya nesneleri düz metin kalır (sunucu → istemci
 * adası sınırından serileşebilir); sayılar çağıran tarafından biçimlenip verilir.
 */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}

export type PublicLocale = 'tr' | 'en';

export function numberLocale(locale: PublicLocale): string {
  return locale === 'en' ? 'en-US' : 'tr-TR';
}

/** Tam sayıyı yerel biçimle yazar (1.000 / 1,000). */
export function formatInt(n: number, locale: PublicLocale): string {
  return new Intl.NumberFormat(numberLocale(locale)).format(Math.round(n));
}

/** Herkese açık iletişim adresi (footer ve yasal metinlerle aynı). */
export const PUBLIC_CONTACT_EMAIL = 'info@qratex.com';
