/**
 * Emekli bayi rotaları → Bugün (`/dealer`) yönlendirme hedefi. Sorgu dizesi korunur;
 * `extra` (ör. `tab=weekly`) üstüne yazılır. Saf: test edilebilir.
 */
export type LegacySearchParams = Promise<Record<string, string | string[] | undefined>>;

export function buildRedirectHref(
  base: string,
  params: Record<string, string | string[] | undefined>,
  extra: Record<string, string> = {}
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || k in extra) continue;
    for (const item of Array.isArray(v) ? v : [v]) sp.append(k, item);
  }
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function legacyHref(base: string, searchParams: LegacySearchParams | undefined, extra: Record<string, string> = {}): Promise<string> {
  return buildRedirectHref(base, (await searchParams) ?? {}, extra);
}
