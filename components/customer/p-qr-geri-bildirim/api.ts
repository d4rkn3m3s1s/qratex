/**
 * Huninin istemci istekleri. Yanıt gövdesi `content-type` bakılarak güvenle okunur: 413/502/504
 * HTML döndüğünde eski sayfa `response.json()`'da patlayıp yalnız "Bir hata oluştu" diyordu
 * (Bulgu 15). Hata türü sınıflanır; `Retry-After` geri sayım için taşınır.
 */
import type { AttributionInput, ClaimFeedbackResult, SubmitFeedbackBody, SubmitFeedbackResult } from '@/lib/feedback-funnel/schema';

export type ApiFailureKind = 'rate_limited' | 'too_large' | 'validation' | 'not_found' | 'forbidden' | 'conflict' | 'server' | 'network';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: ApiFailureKind; message: string | null; retryAfterSec: number | null; reason: string | null };

async function readBody(res: Response): Promise<Record<string, unknown> | null> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) return null;
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function kindOf(status: number): ApiFailureKind {
  if (status === 429) return 'rate_limited';
  if (status === 413) return 'too_large';
  if (status === 400 || status === 415 || status === 422) return 'validation';
  if (status === 404 || status === 410) return 'not_found';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 409) return 'conflict';
  return 'server';
}

async function call<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return { ok: false, kind: 'network', message: null, retryAfterSec: null, reason: null };
  }
  const body = await readBody(res);
  if (res.ok && body && body.ok !== false) {
    return { ok: true, data: (body.data ?? body) as T };
  }
  const retry = Number(res.headers.get('retry-after'));
  const details = body?.details as { reason?: unknown } | undefined;
  return {
    ok: false,
    kind: kindOf(res.status),
    message: typeof body?.error === 'string' ? body.error : null,
    retryAfterSec: Number.isFinite(retry) && retry > 0 ? Math.min(3600, Math.ceil(retry)) : null,
    reason: typeof details?.reason === 'string' ? details.reason : null,
  };
}

export function postFeedback(code: string, body: SubmitFeedbackBody, idemKey: string): Promise<ApiResult<SubmitFeedbackResult>> {
  return call<SubmitFeedbackResult>(`/api/public/feedback/${encodeURIComponent(code)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
    body: JSON.stringify(body),
  });
}

export function postClaim(token: string, idemKey: string): Promise<ApiResult<ClaimFeedbackResult>> {
  return call<ClaimFeedbackResult>('/api/public/feedback-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
    body: JSON.stringify({ token }),
  });
}

/** Tarama beacon'ı — sonuç önemsiz (sayfayı asla bloklamaz). */
export function postScan(code: string, attribution: AttributionInput): void {
  try {
    void fetch(`/api/public/feedback/${encodeURIComponent(code)}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attribution),
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* yok say */
  }
}

/** Tek fotoğraf yükle (XHR: ilerleme yüzdesi). */
export function uploadPhoto(
  code: string,
  file: File,
  onProgress: (pct: number) => void
): { promise: Promise<ApiResult<{ url: string }>>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<ApiResult<{ url: string }>>((resolve) => {
    xhr.open('POST', `/api/public/feedback/${encodeURIComponent(code)}/media`);
    xhr.timeout = 60_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let json: Record<string, unknown> | null = null;
      try {
        json = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        json = null;
      }
      const data = json?.data as { url?: unknown } | undefined;
      if (xhr.status >= 200 && xhr.status < 300 && data && typeof data.url === 'string') {
        onProgress(100);
        resolve({ ok: true, data: { url: data.url } });
        return;
      }
      resolve({
        ok: false,
        kind: kindOf(xhr.status),
        message: typeof json?.error === 'string' ? json.error : null,
        retryAfterSec: null,
        reason: null,
      });
    };
    const fail = () => resolve({ ok: false, kind: 'network', message: null, retryAfterSec: null, reason: null });
    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.onabort = fail;
    const fd = new FormData();
    fd.append('photo', file, 'photo.jpg');
    xhr.send(fd);
  });
  return { promise, abort: () => xhr.abort() };
}
