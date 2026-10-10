/**
 * Puan çarpanı politikası — TEK kaynak (P0-13, P0-21).
 *
 * Önceden mutlu saat çarpanı hiç doğrulanmıyordu (`multiplier || 2.0`), sezonsal kampanya
 * 10× çarpan + 100.000 bonus kabul ediyordu ve tüketim yolunda ikisi çarpılarak tavansız
 * uygulanıyordu. Buradaki sınırlar hem yazma tarafında (zod şemaları) hem okuma tarafında
 * (canlıdaki eski kayıtlar için savunma derinliği) kullanılır.
 *
 * Saf modül: Prisma ya da Next bağımlılığı yok (istemci bileşenleri de içe aktarabilir).
 */

/** Mutlu saat çarpanı aralığı (bayi tanımlar). */
export const HAPPY_HOUR_MULTIPLIER_MIN = 1;
export const HAPPY_HOUR_MULTIPLIER_MAX = 3;
export const HAPPY_HOUR_DEFAULT_MULTIPLIER = 2;

/** Sezonsal kampanya çarpanı aralığı (admin tanımlar). */
export const SEASONAL_MULTIPLIER_MIN = 1;
export const SEASONAL_MULTIPLIER_MAX = 3;

/**
 * Sezonsal kampanyanın HER kazanım olayına eklediği sabit bonusun üst sınırı.
 * Bonus çarpandan bağımsız eklenir; günlük kategori tavanları (feedback 500, tüketim 600)
 * yine geçerlidir. 250 ≈ en cömert tekil geri bildirim ödülünün 2,5 katı.
 */
export const SEASONAL_BONUS_MAX = 250;

/**
 * Çarpan şelalesinin toplam tavanı: mutlu saat × sezon × (VIP × global …) çarpımı bunu
 * aşamaz. 4× = "3× mutlu saat + 1,33× kampanya" gibi makul bir üst senaryo.
 */
export const MULTIPLIER_CASCADE_MAX = 4;

/** Sonlu ve pozitif olmayan değerler 1'e (etkisiz) iner; aralık dışı değer sınıra kırpılır. */
export function clampMultiplier(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(max, Math.max(min, n));
}

export function clampHappyHourMultiplier(value: unknown): number {
  return clampMultiplier(value, HAPPY_HOUR_MULTIPLIER_MIN, HAPPY_HOUR_MULTIPLIER_MAX);
}

export function clampSeasonalMultiplier(value: unknown): number {
  return clampMultiplier(value, SEASONAL_MULTIPLIER_MIN, SEASONAL_MULTIPLIER_MAX);
}

export function clampSeasonalBonus(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(SEASONAL_BONUS_MAX, Math.floor(n));
}

/**
 * Çarpanları çarpar ve toplamı `MULTIPLIER_CASCADE_MAX` ile sınırlar. Geçersiz/eksik
 * çarpanlar 1 sayılır; sonuç hiçbir zaman 1'in altına inmez (çarpan cezaya dönüşmez).
 */
export function combineMultipliers(...multipliers: Array<number | null | undefined>): number {
  let product = 1;
  for (const m of multipliers) {
    if (typeof m !== 'number' || !Number.isFinite(m) || m <= 0) continue;
    product *= m;
  }
  return Math.min(MULTIPLIER_CASCADE_MAX, Math.max(1, product));
}
