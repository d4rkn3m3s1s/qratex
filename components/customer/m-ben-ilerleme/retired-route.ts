/**
 * Emekli rotalar (`/customer/progress-hub`, `/customer/journey-score`, `/customer/trends`,
 * `/customer/analytics`) → Ben → İlerleme. Sorgu parametreleri korunur (yol haritası §6.1).
 * Koçan dosyaları JSX/generic içermesin diye tip ve yol üretimi burada.
 */
export type RetiredSearchParams = Promise<Record<string, string | string[] | undefined>>;

export const PROGRESS_PATH = '/customer/me/progress';

export async function progressRedirectHref(searchParams: RetiredSearchParams, hash?: string): Promise<string> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const x of Array.isArray(v) ? v : v != null ? [v] : []) sp.append(k, x);
  }
  const qs = sp.toString();
  return `${PROGRESS_PATH}${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`;
}
