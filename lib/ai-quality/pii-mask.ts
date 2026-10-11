/**
 * Serbest metinde kişisel veri maskesi (saf). Yönetici ekranında sohbet ve yorum metni
 * varsayılan olarak bununla gösterilir; ham metin yalnız gerekçeli + denetim kayıtlı açılır.
 *
 * Kapsam: e-posta, IBAN (TR ve genel), kart numarası (13–19 hane), TC kimlik (11 hane),
 * Türkiye telefon numaraları. Amaç kusursuz DLP değil; operatörün göz atarken kişisel veriyi
 * gereksiz yere görmemesi.
 */

export const PII_TOKENS = {
  email: '[e-posta]',
  iban: '[IBAN]',
  card: '[kart no]',
  tckn: '[kimlik no]',
  phone: '[telefon]',
} as const;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// IBAN: 2 harf + 2 hane + 10–30 alfanümerik (boşluklu yazım dahil)
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{2,4}){3,8}\b/gi;
// 13–19 hane, boşluk/tire ile gruplu olabilir
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
const TCKN = /\b[1-9]\d{10}\b/g;
// +90 / 0090 / 0 ile ya da doğrudan 5xx ile başlayan TR telefonları (boşluk, tire, parantez)
const PHONE = /(?:\+|00)?(?:90)?[\s-]*\(?0?[2-5]\d{2}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g;

export function maskPii(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(EMAIL, PII_TOKENS.email)
    .replace(IBAN, (m) => (/\d{6,}/.test(m.replace(/\s/g, '')) ? PII_TOKENS.iban : m))
    .replace(CARD, (m) => (m.replace(/\D/g, '').length >= 13 ? PII_TOKENS.card : m))
    .replace(TCKN, PII_TOKENS.tckn)
    .replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 10 ? PII_TOKENS.phone : m));
}

/** Markdown işaretlerini sadeleştirip tek satır önizleme üretir. */
export function previewText(input: string | null | undefined, max = 160): string {
  const plain = maskPii(input)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
