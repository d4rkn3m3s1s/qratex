/**
 * E-posta normalizasyonu — TEK KAYNAK.
 *
 * Neden: kayıt, giriş, şifre sıfırlama, davet ve personel ekleme yolları e-postayı farklı
 * biçimlerde (bazısı `trim().toLowerCase()`, bazısı ham) yazıp okuyordu. Sonuç: aynı kişi için
 * iki hesap (`Ali@x.com` ↔ `ali@x.com`), lockout/rate-limit anahtarının büyük-küçük harfle
 * atlatılması ve davet çiftliği. Bütün yazma ve okuma noktaları bu fonksiyondan geçmeli.
 *
 * Kurallar (sıra önemli):
 *  1. string değilse → '' (çağıran boşu "geçersiz" sayar).
 *  2. Görünmez karakterler (sıfır genişlikli boşluk/birleştirici, BOM, yumuşak tire) silinir —
 *     kopyala-yapıştırla gelen `ali​@x.com` ayrı hesap açmasın.
 *  3. Unicode NFKC: tam genişlikli `ａｌｉ＠ｘ.com` → `ali@x.com`.
 *  4. Türkçe büyük noktalı `İ` → `i` (JS `toLowerCase()` onu `i̇` = i + U+0307 yapar, eşleşmez).
 *  5. Locale'den bağımsız `toLowerCase()` + baş/son boşluk kırpma.
 *
 * NOT: Gmail'e özgü nokta/`+etiket` katlaması BİLEREK yapılmaz — farklı sağlayıcılarda farklı
 * kutulara gider; birleştirmek hesap ele geçirme vektörü olur.
 */

/** Görünmez karakter kod noktaları (kaynakta çıplak yazılmaz; editör/biçimleyici silebilir). */
const INVISIBLE_CODE_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0x00ad, 0x00ad], // yumuşak tire
  [0x180e, 0x180e], // Moğolca ünlü ayırıcı
  [0x200b, 0x200f], // sıfır genişlikli boşluk/birleştirici, LRM/RLM
  [0x2060, 0x2064], // kelime birleştirici ve görünmez operatörler
  [0xfeff, 0xfeff], // BOM / ZWNBSP
];
const INVISIBLE_CHARS = new RegExp(
  `[${INVISIBLE_CODE_POINTS.map(([a, b]) => (a === b ? String.fromCharCode(a) : `${String.fromCharCode(a)}-${String.fromCharCode(b)}`)).join('')}]`,
  'g'
);

/** E-postayı karşılaştırma ve saklama için kanonik biçime getirir. Geçersiz girdide ''. */
export function normalizeEmail(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(INVISIBLE_CHARS, '')
    .normalize('NFKC')
    .replace(/İ/g, 'i')
    .toLowerCase()
    .trim();
}

/** Boş sonuç yerine null döndüren varyant (opsiyonel alanlar için). */
export function normalizeEmailOrNull(input: unknown): string | null {
  const out = normalizeEmail(input);
  return out ? out : null;
}

/** İki e-posta aynı kişiyi mi gösteriyor? (ikisi de boşsa false). */
export function isSameEmail(a: unknown, b: unknown): boolean {
  const na = normalizeEmail(a);
  return na !== '' && na === normalizeEmail(b);
}

/**
 * Geçiş dönemi Prisma filtresi: veritabanında henüz normalize edilmemiş (büyük harfli) eski
 * kayıtlar da bulunsun diye büyük-küçük harf duyarsız eşleşme. Canlı veri tek seferlik
 * normalize edildikten sonra doğrudan `{ email: normalizeEmail(x) }` kullanılabilir.
 *
 *   prisma.user.findFirst({ where: { email: emailLookupFilter(raw) } })
 */
export function emailLookupFilter(input: unknown): { equals: string; mode: 'insensitive' } {
  return { equals: normalizeEmail(input), mode: 'insensitive' };
}
