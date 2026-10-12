/**
 * ⌘K paleti için Türkçe duyarlı, aksan bağımsız eşleştirme (saf; test edilir).
 * "ödül" ≈ "odul" ≈ "ÖDÜL"; "ılık" ≈ "ilik". Sıralama: etiket başı > kelime başı >
 * etiket içi > anahtar kelime başı > anahtar kelime içi.
 */

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

export function normalizeSearchText(input: string): string {
  return input
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]|i̇/g, (ch) => FOLD[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `needle` harfleri `hay` içinde sırayla (aralıklı olabilir) geçiyor mu. */
export function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) if (hay[j] === needle[i]) i++;
  return i === needle.length;
}

/** 0 = eşleşme yok; büyük = daha iyi. Çok kelimeli sorguda her kelime eşleşmeli. */
export function scoreMatch(query: string, label: string, keywords: readonly string[] = [], extra: readonly string[] = []): number {
  const q = normalizeSearchText(query);
  if (!q) return 1;
  const l = normalizeSearchText(label);
  const kws = [...keywords, ...extra].map(normalizeSearchText);
  const terms = q.split(' ');
  let total = 0;
  for (const term of terms) {
    let best = 0;
    if (l.startsWith(term)) best = 100;
    else if (l.split(/[\s·/,-]+/).some((w) => w.startsWith(term))) best = 80;
    else if (l.includes(term)) best = 60;
    for (const k of kws) {
      if (k.startsWith(term)) best = Math.max(best, 40);
      else if (k.split(/[\s·/,-]+/).some((w) => w.startsWith(term))) best = Math.max(best, 30);
      else if (k.includes(term)) best = Math.max(best, 20);
    }
    // Bulanık geri düşüş: harfler sırayla geçiyorsa ("kllnc" → "kullanıcı") zayıf eşleşme.
    if (best === 0 && term.length >= 3) {
      if (isSubsequence(term, l)) best = 12;
      else if (kws.some((k) => isSubsequence(term, k))) best = 6;
    }
    if (best === 0) return 0;
    total += best;
  }
  // Tam eşleşme ve kısa etiket hafif öne çıkar.
  if (l === q) total += 50;
  return total - Math.min(l.length, 40) / 100;
}
