const TR_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  i̇: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

/**
 * Yazarken kullanılan slug dönüştürücü: Türkçe harfleri ASCII'ye çevirir,
 * boşluğu `-` yapar, `[a-z0-9-]` dışını atar, ardışık `-`'leri birleştirir.
 * Baştaki/sondaki `-` KIRPILMAZ (yazarken "hakkimizda-" ara durumu korunur);
 * kırpma kayıt anında yapılır. API şeması: `/^[a-z0-9-]+$/`.
 */
export function toSlugInput(raw: string): string {
  return raw
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]|i̇/g, (ch) => TR_MAP[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);
}
