/**
 * Yerel biçimlendirme — TEK kaynak (mobil-erisilebilirlik-i18n B11).
 *
 * Eskiden `lib/utils` sabit 'tr-TR' biçimliyordu, modüller ayrı ayrı `formatInt/formatPoints`
 * kopyalıyor ya da `toLocaleString('tr-TR')` / argümansız `toLocaleString()` (cihaz diline göre
 * ekrandan ekrana farklı ayraç) yazıyordu. İstemci bileşenleri `useFormatters()`
 * (lib/app-locale), sunucu bileşenleri `getFormatters(locale)` kullanır. `Intl` nesneleri dil
 * başına bir kez kurulur.
 */
import type { Locale } from '@/i18n/core';

export type Formatters = {
  locale: Locale;
  /** BCP-47 etiketi (Intl / toLocale* için). */
  tag: 'tr-TR' | 'en-US';
  /** Tam sayı / ondalık (ör. 12.345 · 12,345). */
  number: (n: number, options?: Intl.NumberFormatOptions) => string;
  /** Para (varsayılan TRY). */
  currency: (amount: number, currency?: string) => string;
  /** Yüzde (0.25 → %25 · 25%). */
  percent: (ratio: number, maximumFractionDigits?: number) => string;
  /** Tarih (varsayılan orta uzunluk). */
  date: (d: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  /** Göreli zaman ("3 gün önce" · "3 days ago"). */
  relative: (d: Date | string | number, now?: number) => string;
  /** Çoğul seçimi: `plural(n, { one: '# day', other: '# days' })` (# → biçimli sayı). */
  plural: (n: number, forms: { one: string; other: string; zero?: string }) => string;
};

const cache = new Map<Locale, Formatters>();

function toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d);
}

export function getFormatters(locale: Locale): Formatters {
  const hit = cache.get(locale);
  if (hit) return hit;
  const tag = locale === 'en' ? 'en-US' : 'tr-TR';
  const intFmt = new Intl.NumberFormat(tag);
  const dateFmt = new Intl.DateTimeFormat(tag, { dateStyle: 'medium' });
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
  const pr = new Intl.PluralRules(tag);

  const number: Formatters['number'] = (n, options) =>
    options ? new Intl.NumberFormat(tag, options).format(n) : intFmt.format(n);

  const relative: Formatters['relative'] = (d, now = Date.now()) => {
    const diffSec = Math.round((toDate(d).getTime() - now) / 1000);
    const abs = Math.abs(diffSec);
    if (abs < 60) return rtf.format(diffSec, 'second');
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
    if (abs < 86400 * 7) return rtf.format(Math.round(diffSec / 86400), 'day');
    if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / (86400 * 7)), 'week');
    if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), 'month');
    return rtf.format(Math.round(diffSec / (86400 * 365)), 'year');
  };

  const f: Formatters = {
    locale,
    tag,
    number,
    currency: (amount, currency = 'TRY') => new Intl.NumberFormat(tag, { style: 'currency', currency }).format(amount),
    percent: (ratio, maximumFractionDigits = 0) =>
      new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits }).format(ratio),
    date: (d, options) => (options ? new Intl.DateTimeFormat(tag, options) : dateFmt).format(toDate(d)),
    relative,
    plural: (n, forms) => {
      const form = n === 0 && forms.zero ? forms.zero : pr.select(n) === 'one' ? forms.one : forms.other;
      return form.replace(/#/g, intFmt.format(n));
    },
  };
  cache.set(locale, f);
  return f;
}
