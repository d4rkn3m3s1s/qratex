'use client';

/** Kasa + defter istemci yardımcıları: zarf v2 okuma, biçimleme. */

export class KasaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null
  ) {
    super(message);
    this.name = 'KasaApiError';
  }
}

export async function kasaFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch {
    throw new KasaApiError('Failed to fetch', 0, 'NETWORK');
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!res.ok || body?.success === false) {
    const msg = (body?.error as string) || (body?.message as string) || `HTTP ${res.status}`;
    throw new KasaApiError(msg, res.status, (body?.code as string) ?? null);
  }
  return ((body?.data ?? body) as T);
}

export function postJson<T>(url: string, payload: unknown, headers: Record<string, string> = {}): Promise<T> {
  return kasaFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
}

export function newClientOpId(): string {
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `kasa:${rnd}`;
}

export function formatMoney(n: number | null | undefined, locale: string): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n);
}

export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatRelative(iso: string, locale: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
