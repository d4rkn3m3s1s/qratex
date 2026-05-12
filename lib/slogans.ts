/**
 * Site sloganları: ana sayfa veya footer'da rastgele gösterilir.
 * 8 slogan + 9. madde boş (ileride eklenebilir).
 */
export const SLOGANS: string[] = [
  'Sesiniz değerli, geri bildiriminiz fark yaratır.',
  'Her yorum bir adım, birlikte daha iyiye.',
  'Puanlarınızı toplayın, ödülleri keşfedin.',
  'Sadakatınız ödüllendirilsin.',
  'Anket doldurun, rozetler kazanın.',
  'Müşteri deneyimini birlikte iyileştiriyoruz.',
  'Geri bildirim verin, farkı hissedin.',
  'QR ile hızlı, puanlarla keyifli.',
  '', // 9. madde – ileride eklenecek
];

export function getRandomSlogan(): string {
  const valid = SLOGANS.filter(Boolean);
  if (valid.length === 0) return '';
  return valid[Math.floor(Math.random() * valid.length)];
}
