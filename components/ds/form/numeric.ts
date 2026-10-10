/**
 * Sayı ve para ayrıştırma/biçimlendirme — saf fonksiyonlar (birim testi yazılabilir).
 *
 * Kullanıcı Türkçe klavyede hem "1,5" hem "1.5" yazar; "1.500" ise binlik gruptur.
 * Kural: iki ayırıcı birlikteyse SONUNCU ondalıktır. Tek ayırıcı varsa yerel ondalık
 * ayırıcı ise ondalık; yerel grup ayırıcı ise yalnız "1–3 hane + tam 3 hane" kalıbında
 * grup sayılır (tr: "1.500" → 1500, "1.5" → 1,5).
 *
 * Para HİÇBİR adımda kayan noktayla hesaplanmaz: metin → tam sayı kuruş.
 */

export type NumericLocale = 'tr' | 'en';

export function separators(locale: NumericLocale): { decimal: string; group: string } {
  return locale === 'en' ? { decimal: '.', group: ',' } : { decimal: ',', group: '.' };
}

function validGroups(head: string, groupChar: string): boolean {
  const parts = head.split(groupChar);
  if (parts.length === 1) return /^\d*$/.test(head);
  const [first, ...rest] = parts;
  return /^\d{1,3}$/.test(first ?? '') && rest.every((p) => /^\d{3}$/.test(p));
}

/**
 * Kullanıcı metnini kanonik ondalık dizeye çevirir (`"-1234.5"`).
 * Boş metin → `''`; geçersiz → `null`.
 */
export function normalizeNumericText(text: string, locale: NumericLocale): string | null {
  let s = text.trim().replace(/[\s  ']/g, '');
  if (!s) return '';
  s = s.replace(/^−/, '-');
  let sign = '';
  if (s.startsWith('-')) {
    sign = '-';
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!s || !/^[0-9.,]+$/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart = '';
  let fracPart = '';

  if (lastDot >= 0 && lastComma >= 0) {
    const decIdx = Math.max(lastDot, lastComma);
    const decChar = s.charAt(decIdx);
    const groupChar = decChar === '.' ? ',' : '.';
    const head = s.slice(0, decIdx);
    fracPart = s.slice(decIdx + 1);
    if (/[.,]/.test(fracPart) || head.includes(decChar)) return null;
    if (!validGroups(head, groupChar)) return null;
    intPart = head.split(groupChar).join('');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const ch = lastDot >= 0 ? '.' : ',';
    const parts = s.split(ch);
    if (parts.length > 2) {
      if (!validGroups(s, ch)) return null;
      intPart = parts.join('');
    } else {
      const a = parts[0] ?? '';
      const b = parts[1] ?? '';
      const { decimal } = separators(locale);
      if (ch !== decimal && b.length === 3 && /^[1-9]\d{0,2}$/.test(a)) {
        intPart = a + b; // yerel grup ayırıcı: "1.500" (tr) / "1,500" (en)
      } else {
        intPart = a;
        fracPart = b;
      }
    }
  } else {
    intPart = s;
  }

  if (intPart === '' && fracPart === '') return null;
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || (fracPart !== '' && !/^\d+$/.test(fracPart))) return null;
  intPart = intPart.replace(/^0+(?=\d)/, '');
  fracPart = fracPart.replace(/0+$/, '');
  const canonical = `${intPart}${fracPart ? `.${fracPart}` : ''}`;
  return canonical === '0' ? '0' : `${sign}${canonical}`;
}

export type ParsedNumber =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'ok'; value: number; fractionDigits: number };

export function parseLocaleNumber(text: string, locale: NumericLocale): ParsedNumber {
  const canonical = normalizeNumericText(text, locale);
  if (canonical === '') return { kind: 'empty' };
  if (canonical == null) return { kind: 'invalid' };
  const value = Number(canonical);
  if (!Number.isFinite(value)) return { kind: 'invalid' };
  const dot = canonical.indexOf('.');
  return { kind: 'ok', value, fractionDigits: dot >= 0 ? canonical.length - dot - 1 : 0 };
}

export type ParsedMoney = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; minor: number };

/**
 * Para metnini tam sayı alt birime (kuruş) çevirir. En fazla 2 ondalık; fazlası geçersiz
 * (sessiz yuvarlama yok — "12,345" kullanıcı hatası olabilir).
 */
export function parseMoneyToMinor(text: string, locale: NumericLocale): ParsedMoney {
  const canonical = normalizeNumericText(text.replace(/[₺$€£]|TL|TRY/gi, ''), locale);
  if (canonical === '') return { kind: 'empty' };
  if (canonical == null) return { kind: 'invalid' };
  const negative = canonical.startsWith('-');
  const [intPart = '0', fracPart = ''] = canonical.replace('-', '').split('.');
  if (fracPart.length > 2) return { kind: 'invalid' };
  const minor = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) return { kind: 'invalid' };
  return { kind: 'ok', minor: negative ? -minor : minor };
}

function localeTag(locale: NumericLocale): string {
  return locale === 'en' ? 'en-US' : 'tr-TR';
}

/** Düzenleme sırasında gösterilecek metin: grup ayırıcısız, yerel ondalık ayırıcılı. */
export function formatNumberForEditing(value: number | null | undefined, locale: NumericLocale): string {
  if (value == null || !Number.isFinite(value)) return '';
  const str = String(value);
  const raw = /e/i.test(str) ? value.toFixed(10).replace(/\.?0+$/, '') : str;
  return raw.replace('.', separators(locale).decimal);
}

/** Odak dışındayken gösterilecek metin: gruplu (1.234,5). */
export function formatNumberDisplay(
  value: number | null | undefined,
  locale: NumericLocale,
  options: { minFractionDigits?: number; maxFractionDigits?: number } = {},
): string {
  if (value == null || !Number.isFinite(value)) return '';
  return new Intl.NumberFormat(localeTag(locale), {
    minimumFractionDigits: options.minFractionDigits ?? 0,
    maximumFractionDigits: Math.max(options.minFractionDigits ?? 0, options.maxFractionDigits ?? 20),
  }).format(value);
}

/** Kuruş → düzenleme metni ("1234,50"); tam sayı aritmetiği. */
export function formatMinorForEditing(minor: number | null | undefined, locale: NumericLocale): string {
  if (minor == null || !Number.isFinite(minor)) return '';
  const abs = Math.abs(Math.trunc(minor));
  const sign = minor < 0 ? '-' : '';
  return `${sign}${Math.floor(abs / 100)}${separators(locale).decimal}${String(abs % 100).padStart(2, '0')}`;
}

/** Kuruş → görüntü metni. `currency` verilirse sembollü ("₺1.234,50"), yoksa yalnız sayı ("1.234,50"). */
export function formatMinor(
  minor: number | null | undefined,
  locale: NumericLocale,
  currency?: string,
): string {
  if (minor == null || !Number.isFinite(minor)) return '';
  const fmt = new Intl.NumberFormat(localeTag(locale), {
    ...(currency ? { style: 'currency' as const, currency } : {}),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return fmt.format(Math.trunc(minor) / 100);
}

/** Para birimi sembolü (TRY → ₺). */
export function currencySymbol(currency: string, locale: NumericLocale): string {
  try {
    const part = new Intl.NumberFormat(localeTag(locale), { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

export function clamp(value: number, min?: number, max?: number): number {
  let v = value;
  if (typeof min === 'number' && v < min) v = min;
  if (typeof max === 'number' && v > max) v = max;
  return v;
}

/** Ondalık hassasiyetle yuvarlama (0.1 + 0.2 sorununu ölçekleyerek önler). */
export function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** Math.max(0, Math.min(10, Math.trunc(digits)));
  return Math.round((value + Math.sign(value) * Number.EPSILON) * f) / f;
}
