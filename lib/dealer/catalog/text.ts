/**
 * Ürün kataloğu — Türkçe duyarlı metin karşılaştırma (Bulgu 4). Saf.
 *
 * `"İskender".toLowerCase()` → `"i̇skender"` (i + U+0307) olduğu için eski arama "iskender"
 * ile eşleşmiyordu; "IRMIK" de "irmik"e iniyordu. Burada `tr-TR` küçültme + birleşik işaret
 * (aksan/nokta/çengel) atma + `ı → i` ile hem büyük/küçük hem aksan duyarsız karşılaştırılır:
 * "sis" → "Şiş", "iskender" → "İSKENDER", "irmik" → "IRMIK".
 */
export function normalizeForSearch(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sorgunun HER kelimesi alanlardan birinin birleşiminde geçiyorsa eşleşir. */
export function matchesSearch(fields: ReadonlyArray<string | null | undefined>, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const hay = fields.map((f) => normalizeForSearch(f)).join(' \u0000 ');
  return q.split(' ').every((token) => hay.includes(token));
}

/** Ad karşılaştırması (yinelenen kategori/ürün tespiti): boşluk ve büyük/küçük duyarsız. */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeForSearch(a) === normalizeForSearch(b) && normalizeForSearch(a) !== '';
}

/** Türkçe alfabetik sıralayıcı (Ç, Ğ, İ, Ö, Ş, Ü doğru yerde). */
export const trCollator = new Intl.Collator('tr-TR', { sensitivity: 'base', numeric: true });
