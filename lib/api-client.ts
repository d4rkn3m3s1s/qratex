/**
 * Tipli istemci API katmanı (mimari-api B9 / §5.4) — zarf v2'yi TEK yerde çözer.
 *
 *   const data = await api.get<{ results: Results }>('/api/search', { query: { q }, signal });
 *   await api.post('/api/notifications', { notificationId });
 *
 * Kurallar (modül-yerel `fetchJson` kopyalarının ortak paydası):
 *  - `!res.ok`, `success: false` / `ok: false` ya da JSON olmayan gövde ASLA boş veri gibi dönmez;
 *    kodlu `ApiClientError` fırlatılır (QueryState hatayı "boş liste" sanmaz).
 *  - Başarıda zarf v2'nin `data` alanı döner; eski `{ success, ...alanlar }` yanıtlarında gövdenin
 *    kendisi döner (geçiş dönemi uyumu).
 *  - Hata mesajı sunucunun Türkçe `error`/`message` alanıdır; yoksa duruma göre Türkçe varsayılan.
 *  - 429'da `Retry-After` saniyesi `retryAfterSec` olarak taşınır; `requestId` destek için korunur.
 *  - Ağ hatası `code: 'NETWORK'`, iptal (`AbortSignal`) özgün `AbortError` olarak yeniden fırlatılır
 *    (React Query iptali hata saymasın).
 *
 * Yeni istemci kodu modül-yerel `XxxApiError` sınıfı yazmak yerine bunu kullanır; mevcut modül
 * istemcileri `ApiClientError`'dan türeyerek kademeli olarak buraya taşınır.
 */

export interface ApiErrorDetail {
  path: string;
  message: string;
  code?: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly retryAfterSec: number | null;

  constructor(
    message: string,
    init: {
      status: number;
      code: string;
      details?: unknown;
      requestId?: string | null;
      retryable?: boolean;
      retryAfterSec?: number | null;
    }
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId ?? null;
    this.retryable = init.retryable ?? (init.status === 0 || init.status === 429 || init.status >= 500);
    this.retryAfterSec = init.retryAfterSec ?? null;
  }

  /** Alan bazlı doğrulama hataları (`VALIDATION` + zod `details`) → { 'alan.yolu': 'mesaj' }. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (!Array.isArray(this.details)) return out;
    for (const d of this.details as unknown[]) {
      if (d && typeof d === 'object' && typeof (d as ApiErrorDetail).path === 'string') {
        const { path, message } = d as ApiErrorDetail;
        if (!(path in out) && typeof message === 'string') out[path] = message;
      }
    }
    return out;
  }
}

const NETWORK_MESSAGE = 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';

/** Duruma göre Türkçe varsayılan mesaj (sunucu mesaj vermediyse). */
export function defaultMessageForStatus(status: number): string {
  if (status === 0) return NETWORK_MESSAGE;
  if (status === 401) return 'Oturumunuz sona erdi. Lütfen yeniden giriş yapın.';
  if (status === 403) return 'Bu işlem için yetkiniz yok.';
  if (status === 404) return 'Kayıt bulunamadı.';
  if (status === 409) return 'Bu işlem mevcut kayıtla çakışıyor.';
  if (status === 413) return 'Gönderilen veri çok büyük.';
  if (status === 429) return 'Çok fazla istek gönderdiniz. Lütfen biraz sonra tekrar deneyin.';
  if (status === 503) return 'Hizmet geçici olarak ulaşılamıyor. Lütfen birazdan tekrar deneyin.';
  if (status >= 500) return 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';
  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
}

function defaultCodeForStatus(status: number): string {
  if (status === 0) return 'NETWORK';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 415) return 'UNSUPPORTED_MEDIA_TYPE';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  if (status >= 500) return 'INTERNAL';
  return 'REQUEST_FAILED';
}

type Envelope = {
  ok?: unknown;
  success?: unknown;
  data?: unknown;
  error?: unknown;
  message?: unknown;
  code?: unknown;
  details?: unknown;
  retryable?: unknown;
  requestId?: unknown;
};

function parseRetryAfter(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  return null;
}

/**
 * Bir `Response`'u zarf v2 kurallarıyla çözer (fetch dışında elde edilmiş yanıtlar için de).
 * Başarıda `data` (yoksa gövde), hatada `ApiClientError`.
 */
export async function decodeApiResponse<T>(res: Response): Promise<T> {
  let body: unknown = null;
  let parsed = false;
  if (res.status !== 204) {
    try {
      const text = await res.text();
      if (text.length > 0) {
        body = JSON.parse(text);
        parsed = true;
      }
    } catch {
      body = null;
    }
  }
  const env = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Envelope;
  const failed = !res.ok || env.success === false || env.ok === false;
  if (failed) {
    const status = res.ok ? 400 : res.status;
    const message =
      (typeof env.error === 'string' && env.error) ||
      (typeof env.message === 'string' && env.message) ||
      defaultMessageForStatus(status);
    throw new ApiClientError(message, {
      status,
      code: typeof env.code === 'string' && env.code ? env.code : defaultCodeForStatus(status),
      details: env.details,
      requestId: (typeof env.requestId === 'string' && env.requestId) || res.headers.get('x-request-id'),
      retryable: typeof env.retryable === 'boolean' ? env.retryable : undefined,
      retryAfterSec: parseRetryAfter(res.headers.get('retry-after')),
    });
  }
  if (res.status !== 204 && !parsed) {
    // 2xx ama JSON değil: sessizce boş veri sayma.
    throw new ApiClientError('Sunucudan beklenmeyen yanıt alındı. Lütfen tekrar deneyin.', {
      status: res.status,
      code: 'BAD_RESPONSE',
      requestId: res.headers.get('x-request-id'),
      retryable: true,
    });
  }
  if ('data' in env && (env.success === true || env.ok === true)) return env.data as T;
  return body as T;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions {
  query?: Record<string, QueryValue | ReadonlyArray<QueryValue>>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** `Idempotency-Key` başlığı (yalnız yazma işlemlerinde anlamlı). */
  idempotencyKey?: string;
}

export function buildApiUrl(path: string, query?: ApiRequestOptions['query']): string {
  if (!query) return path;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values as QueryValue[]) {
      if (v === undefined || v === null || v === '') continue;
      sp.append(key, String(v));
    }
  }
  const qs = sp.toString();
  if (!qs) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${qs}`;
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts: ApiRequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...(opts.headers ?? {}) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(buildApiUrl(path, opts.query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: opts.signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ApiClientError(NETWORK_MESSAGE, { status: 0, code: 'NETWORK', retryable: true });
  }
  return decodeApiResponse<T>(res);
}

export const api = {
  get: <T>(path: string, opts?: ApiRequestOptions) => apiRequest<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: ApiRequestOptions) => apiRequest<T>('POST', path, body ?? {}, opts),
  put: <T>(path: string, body?: unknown, opts?: ApiRequestOptions) => apiRequest<T>('PUT', path, body ?? {}, opts),
  patch: <T>(path: string, body?: unknown, opts?: ApiRequestOptions) => apiRequest<T>('PATCH', path, body ?? {}, opts),
  delete: <T>(path: string, body?: unknown, opts?: ApiRequestOptions) => apiRequest<T>('DELETE', path, body, opts),
};

/** Kullanıcıya gösterilecek mesaj (ApiClientError ise sunucunun Türkçe mesajı). */
export function apiErrorMessage(err: unknown, fallback = 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'): string {
  if (err instanceof ApiClientError && err.message) return err.message;
  if (err instanceof Error && err.message && !isAbortError(err)) return err.message;
  return fallback;
}
