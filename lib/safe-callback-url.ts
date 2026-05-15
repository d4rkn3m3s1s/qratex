function trimTrailingSlash(s: string): string {
  return s.replace(/\/$/, '');
}

/**
 * Limits open redirects: same-origin relative paths (`/…`) or absolute URLs whose origin matches `allowedOrigin`.
 */
export function safePostLoginRedirect(raw: string | null | undefined, allowedOrigin: string): string | undefined {
  if (raw == null) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (s.length > 2048) return undefined;
  if (s.startsWith('/') && !s.startsWith('//')) return s;

  const base = trimTrailingSlash(allowedOrigin.trim());
  if (!base || !base.startsWith('http')) return undefined;

  try {
    const u = new URL(s);
    const b = new URL(base);
    if (u.origin !== b.origin) return undefined;
    const out = `${u.pathname}${u.search}${u.hash}`;
    if (!out.startsWith('/') || out.length > 2048) return undefined;
    return out || '/';
  } catch {
    return undefined;
  }
}
