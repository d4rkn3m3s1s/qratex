/**
 * Emekli bayi rotaları (`/dealer/benchmark`, `/dealer/roi`, `/dealer/business-outcomes`) için
 * yönlendirme hedefi — sorgu parametreleri korunur. Saf (sunucu koçanları kullanır).
 */
export type LegacySearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function legacyHref(target: string, searchParams: LegacySearchParams): Promise<string> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const x of Array.isArray(v) ? v : v == null ? [] : [v]) sp.append(k, x);
  }
  const qs = sp.toString();
  return qs ? `${target}?${qs}` : target;
}
