'use client';

/**
 * Ekip yüzeyi (bayi /dealer/team + personel /staff) ortak istemci yardımcıları:
 * zarf v2 okuma, biçimleme (İstanbul saati), ad baş harfleri.
 */

export class TeamApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'TeamApiError';
  }
}

export async function teamFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch {
    throw new TeamApiError('Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.', 0, 'NETWORK');
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!res.ok || body?.success === false) {
    const msg = (body?.error as string) || (body?.message as string) || `Sunucu hatası (${res.status})`;
    throw new TeamApiError(msg, res.status, (body?.code as string) ?? null, body?.details);
  }
  return (body && 'data' in body ? body.data : body) as T;
}

export function sendJson<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', payload?: unknown): Promise<T> {
  return teamFetch<T>(url, {
    method,
    headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

const TZ = 'Europe/Istanbul';

export function fmtTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  );
}

/** `YYYY-MM-DD` (takvim günü) → "12 Eki Paz". UTC öğlen kullanılır ki gün kaymasın. */
export function fmtDay(ymd: string, locale: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).format(new Date(`${ymd}T12:00:00Z`));
}

export function fmtRelative(iso: string, locale: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < 60_000) return rtf.format(0, 'minute');
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 14 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export function fmtMinutes(min: number | null | undefined, locale: string): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (locale.startsWith('en')) return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  return h ? `${h} sa ${String(m).padStart(2, '0')} dk` : `${m} dk`;
}

export function initials(name: string | null | undefined, fallback = '?'): string {
  // Harf/rakam dışı karakterler ("[", "(", "-", emoji) baş harf olmaz — "[Ali] Veli" → "AV".
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (!parts.length) return fallback;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toLocaleUpperCase('tr-TR');
}

/** İstanbul'a göre bugünün `YYYY-MM-DD`'si (istemci). */
export function todayYmdClient(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** `datetime-local` değeri (İstanbul saati) → ISO. */
export function istanbulLocalToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  return new Date(`${v}:00+03:00`).toISOString();
}

/** ISO → `datetime-local` değeri (İstanbul saati). */
export function isoToIstanbulLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 3 * 3_600_000).toISOString().slice(0, 16);
}

export function newClientId(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}:${rnd}`;
}
