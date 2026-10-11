/**
 * Emekli rotalar (/customer/my-card, /customer/lounge) → Cüzdan → Kartım; sorgu korunur.
 * Koçan dosyası var olduğu sürece yönlendirmeyi koçan yapar (`lib/navigation/next-redirects.js`:
 * next.config eşlemesi yalnız eski sayfa dosyası silinince etkinleşir).
 */
export type LegacySearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function walletCardHref(searchParams: LegacySearchParams): Promise<string> {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) sp.append(key, v);
  }
  const qs = sp.toString();
  return `/customer/wallet/card${qs ? `?${qs}` : ''}`;
}
