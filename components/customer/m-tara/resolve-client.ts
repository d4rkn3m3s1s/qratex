/**
 * İstemci tarafı çözüm çağrısı: BFF'e gider, hatayı makine-okur koda çevirir.
 * Tanınmayan içerikte (başka site, Wi-Fi QR'ı…) hiç istek atılmaz.
 */
import { parseQrPayload } from '@/lib/qr-resolve';
import type { ScanResolution, ScanSource } from './scan-types';

export type ResolveFailure = 'offline' | 'network' | 'rate_limited' | 'session' | 'server';

export type ResolveOutcome =
  | { ok: true; result: ScanResolution }
  | { ok: false; error: ResolveFailure; retryAfterSec?: number };

function retryAfterOf(res: Response): number {
  const raw = Number(res.headers.get('Retry-After'));
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.ceil(raw), 600) : 30;
}

export async function resolveScan(text: string, source: ScanSource, signal?: AbortSignal): Promise<ResolveOutcome> {
  if (parseQrPayload(text).kind === 'unknown') return { ok: true, result: { kind: 'unknown' } };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, error: 'offline' };

  let res: Response;
  try {
    res = await fetch('/api/customer/scan/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), source }),
      cache: 'no-store',
      signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    return { ok: false, error: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network' };
  }

  if (res.status === 429) return { ok: false, error: 'rate_limited', retryAfterSec: retryAfterOf(res) };
  if (res.status === 401 || res.status === 403) return { ok: false, error: 'session' };
  if (!res.ok) return { ok: false, error: 'server' };

  try {
    const json = (await res.json()) as { data?: { result?: ScanResolution } };
    const result = json?.data?.result;
    if (!result || typeof result !== 'object' || !('kind' in result)) return { ok: false, error: 'server' };
    return { ok: true, result };
  } catch {
    return { ok: false, error: 'server' };
  }
}

export type ActivateOutcome =
  | { ok: true }
  | { ok: false; reason: 'mine' | 'taken' | 'blocked' | 'not_found' | 'rate_limited' | 'session' | 'offline' | 'failed'; retryAfterSec?: number };

/**
 * Kart aktivasyonu — tek doğruluk kaynağı `POST /api/cards/[token]/activate` (koşullu yazma,
 * denetim kaydı). Hem eski `{ code }` hem zarf v2 `{ code }` gövdesini okur.
 */
export async function activateCard(token: string): Promise<ActivateOutcome> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  let res: Response;
  try {
    res = await fetch(`/api/cards/${encodeURIComponent(token)}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (res.ok) return { ok: true };
  if (res.status === 429) return { ok: false, reason: 'rate_limited', retryAfterSec: retryAfterOf(res) };
  if (res.status === 401) return { ok: false, reason: 'session' };
  let code = '';
  try {
    const json = (await res.json()) as { code?: unknown };
    code = typeof json?.code === 'string' ? json.code : '';
  } catch {
    // gövdesiz hata
  }
  switch (code) {
    case 'ALREADY_YOURS':
      return { ok: false, reason: 'mine' };
    case 'ALREADY_ACTIVATED':
      return { ok: false, reason: 'taken' };
    case 'CARD_BLOCKED':
      return { ok: false, reason: 'blocked' };
    case 'CARD_NOT_FOUND':
    case 'NOT_FOUND':
      return { ok: false, reason: 'not_found' };
    case 'UNAUTHORIZED':
    case 'UNAUTHENTICATED':
      return { ok: false, reason: 'session' };
    default:
      return { ok: false, reason: 'failed' };
  }
}
