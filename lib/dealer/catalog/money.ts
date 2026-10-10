/**
 * Ürün kataloğu — para yardımcıları (kuruş). Saf; istemci ve sunucu ortak kullanır.
 *
 * `Product.price` şemada hâlâ `Float` (ŞEMA İSTEĞİ: `Decimal(10,2)` ya da `priceMinor Int`).
 * Kayan nokta hatasını sınırda kesmek için API sözleşmesi TAM SAYI KURUŞTUR (`priceMinor`):
 * istemci (`MoneyField`) kuruş gönderir, sunucu yalnız `minor / 100` yazar ve okurken
 * `Math.round(price * 100)` ile kuruşa döner. Hesap (toplu % artış, CSV) hep kuruşta yapılır.
 */

/** Kabul edilen en yüksek fiyat: 1.000.000,00 ₺. */
export const MAX_PRICE_MINOR = 100_000_000;

/** Kuruş → `Product.price` (Float) sütununa yazılacak değer. */
export function minorToPrice(minor: number | null): number | null {
  if (minor === null || !Number.isFinite(minor)) return null;
  return Math.round(minor) / 100;
}

/** `Product.price` (Float) → tam sayı kuruş. */
export function priceToMinor(price: number | null | undefined): number | null {
  if (price === null || price === undefined || !Number.isFinite(price)) return null;
  return Math.round(price * 100);
}

export type PriceParseResult =
  | { ok: true; minor: number | null }
  | { ok: false; reason: 'format' | 'negative' | 'precision' | 'max' };

/**
 * Serbest metin fiyatı kuruşa çevirir (CSV içe aktarma). Türkçe biçim önceliklidir:
 *  - "45" · "45,5" · "45,50" · "₺45" · "45 TL" · "1.234,50" · "1.500" (= 1500) · "45.50"
 *  - Virgül her zaman ondalıktır; tek nokta yalnız `1.234` (binlik) kalıbı değilse ondalıktır.
 *  - Boş → `null` (fiyatsız ürün). 2'den fazla ondalık hane → hata (sessiz yuvarlama yok).
 */
export function parsePriceToMinor(input: string | null | undefined): PriceParseResult {
  if (input === null || input === undefined) return { ok: true, minor: null };
  let s = String(input)
    .replace(/[\s  ]/g, '')
    .replace(/₺/g, '')
    .replace(/(try|tl)$/i, '')
    .replace(/^(try|tl)/i, '');
  if (s === '') return { ok: true, minor: null };
  if (s.startsWith('-')) return { ok: false, reason: 'negative' };
  if (s.startsWith('+')) s = s.slice(1);

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      // 1.234,50 → binlik nokta, ondalık virgül
      if (!/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) return { ok: false, reason: 'format' };
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.50 → binlik virgül, ondalık nokta
      if (!/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) return { ok: false, reason: 'format' };
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    if ((s.match(/,/g) ?? []).length > 1) return { ok: false, reason: 'format' };
    s = s.replace(',', '.');
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else if ((s.match(/\./g) ?? []).length > 1) return { ok: false, reason: 'format' };
  }

  const m = /^(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return { ok: false, reason: 'format' };
  const frac = m[2] ?? '';
  if (frac.length > 2) return { ok: false, reason: 'precision' };
  const whole = m[1].replace(/^0+(?=\d)/, '');
  if (whole.length > 9) return { ok: false, reason: 'max' };
  const minor = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(minor)) return { ok: false, reason: 'format' };
  if (minor > MAX_PRICE_MINOR) return { ok: false, reason: 'max' };
  return { ok: true, minor };
}

/**
 * Yüzde değişim (toplu fiyat güncelleme) — kuruşta, yarım yukarı yuvarlar; `roundTo`
 * (kuruş) verilirse en yakın katına yuvarlar (ör. 50 → ,00/,50; 100 → tam lira).
 * Sonuç [0, MAX_PRICE_MINOR] aralığına sıkıştırılır.
 */
export function adjustMinorByPercent(minor: number, percent: number, roundTo = 1): number {
  const step = Number.isInteger(roundTo) && roundTo > 0 ? roundTo : 1;
  // percent en fazla 1 ondalık → binde birlik tam sayıyla çarpıp kayan nokta biriktirmeyiz.
  const permille = Math.round(percent * 10);
  const raw = (minor * (1000 + permille)) / 1000;
  const rounded = Math.round(raw / step) * step;
  return Math.min(MAX_PRICE_MINOR, Math.max(0, rounded));
}

const fmtCache = new Map<string, Intl.NumberFormat>();

/** "₺45,50" (tr) · "₺45.50" (en). */
export function formatMinor(minor: number, locale: 'tr' | 'en' = 'tr'): string {
  const key = locale;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    fmtCache.set(key, f);
  }
  return f.format(minor / 100);
}

/** CSV dışa aktarma: "45,50" (Türkçe ondalık, sembolsüz; içe aktarma geri okuyabilir). */
export function minorToPlain(minor: number | null): string {
  if (minor === null) return '';
  const whole = Math.trunc(minor / 100);
  const frac = String(Math.abs(minor % 100)).padStart(2, '0');
  return `${whole},${frac}`;
}
