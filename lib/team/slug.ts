/**
 * Türkçe-güvenli slug. Eski kod `toLowerCase()` kullanıyordu: "İ" → "i̇" (birleşik nokta)
 * → "i-nsan-kaynaklari" gibi bozuk slug üretiyordu (denetim Bulgu 11).
 */
export function slugifyTr(input: string): string {
  return input
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}
