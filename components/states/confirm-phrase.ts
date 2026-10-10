/**
 * Tipli onay karşılaştırması — Türkçe büyük/küçük harf duyarsız
 * ("İSTANBUL" = "istanbul", "ı" ≠ "i" korunur), Unicode normalize, baş/son
 * ve çoklu boşluk yok sayılır.
 */
export function normalizeConfirmPhrase(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export function matchesConfirmPhrase(typed: string, phrase: string): boolean {
  if (!phrase) return true;
  return normalizeConfirmPhrase(typed) === normalizeConfirmPhrase(phrase);
}
