/**
 * Ayar ekranları için istemci veri durum makinesi (P0-28 / K4) — SAF mantık (React'sız,
 * Jest ile test edilir). Hook: `hooks/use-versioned-resource.ts`.
 *
 *   idle → loading → ready | error
 *
 * Kural: form YALNIZ `ready` iken render edilir ve kaydedilebilir. `ready` olmak için sunucu
 * hem veriyi hem `version`'ı döndürmüş olmalı; istemcide "varsayılan kopya" yoktur, yükleme
 * hatası asla düzenlenebilir bir form olarak görünmez. Kaydetme `baseVersion` taşır; sunucu
 * uyuşmazlıkta 409 `VERSION_CONFLICT` döner (bkz. `lib/settings-version.ts`).
 */

export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ResourceState<T> = {
  status: ResourceStatus;
  data: T | null;
  version: string | null;
  error: unknown;
  /** Son başlatılan yüklemenin kimliği; geç gelen eski yanıtlar yok sayılır. */
  requestId: number;
};

export type ResourceAction<T> =
  | { type: 'load'; requestId: number }
  | { type: 'loaded'; requestId: number; data: T; version: string }
  | { type: 'failed'; requestId: number; error: unknown }
  | { type: 'committed'; data: T; version: string };

export const VERSION_CONFLICT_CODE = 'VERSION_CONFLICT';

export function initialResourceState<T>(): ResourceState<T> {
  return { status: 'idle', data: null, version: null, error: null, requestId: 0 };
}

export function resourceReducer<T>(state: ResourceState<T>, action: ResourceAction<T>): ResourceState<T> {
  switch (action.type) {
    case 'load':
      // Yeniden yüklemede eski veri ve sürüm TEMİZLENİR: yükleme bitene kadar form gösterilmez.
      return { status: 'loading', data: null, version: null, error: null, requestId: action.requestId };
    case 'loaded':
      if (action.requestId !== state.requestId) return state;
      if (typeof action.version !== 'string' || action.version.length === 0) {
        return {
          ...state,
          status: 'error',
          data: null,
          version: null,
          error: new HttpError(500, 'MISSING_VERSION', MISSING_VERSION_MESSAGE),
        };
      }
      return { status: 'ready', data: action.data, version: action.version, error: null, requestId: state.requestId };
    case 'failed':
      if (action.requestId !== state.requestId) return state;
      return { status: 'error', data: null, version: null, error: action.error ?? new Error('Bilinmeyen hata'), requestId: state.requestId };
    case 'committed':
      // Yalnız hazır bir kaynağa kayıt sonucu işlenir (yükleme sürerken gelen geç yanıt yok sayılır).
      if (state.status !== 'ready') return state;
      return { ...state, data: action.data, version: action.version };
    default:
      return state;
  }
}

/** Form gösterilebilir ve kaydedilebilir mi? */
export function isEditable<T>(state: ResourceState<T>): boolean {
  return state.status === 'ready' && state.data !== null && typeof state.version === 'string';
}

export const MISSING_VERSION_MESSAGE =
  'Sunucu sürüm bilgisi döndürmedi; güvenlik için düzenleme kilitli. Sayfayı yenileyin.';
const INVALID_RESPONSE_MESSAGE = 'Sunucudan geçersiz bir yanıt alındı. Oturumunuz düşmüş olabilir; sayfayı yenileyin.';

/** `classifyError` (components/states) `status`/`code` alanlarını okur. */
export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;
  constructor(status: number, code: string | undefined, message: string, body?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

type JsonObject = Record<string, unknown>;

async function parseJson(res: Response): Promise<JsonObject> {
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    // Oturum düşünce HTML yönlendirmesi gelir → JSON değil.
    throw new HttpError(res.status || 500, 'INVALID_RESPONSE', INVALID_RESPONSE_MESSAGE);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(res.status || 500, 'INVALID_RESPONSE', INVALID_RESPONSE_MESSAGE);
  }
  return parsed as JsonObject;
}

function errorMessage(body: JsonObject, fallback: string): string {
  if (typeof body.error === 'string' && body.error.trim()) return body.error;
  if (typeof body.message === 'string' && body.message.trim()) return body.message;
  return fallback;
}

/**
 * GET yardımcısı: `res.ok` ve `success !== false` zorunlu; aksi hâlde `HttpError` fırlatır.
 * Hata asla "boş veri" olarak dönmez.
 */
export async function fetchResourceJson(
  url: string,
  fallbackError: string = 'Veriler yüklenemedi',
  init?: RequestInit
): Promise<JsonObject> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });
  const body = await parseJson(res);
  if (!res.ok || body.success === false) {
    throw new HttpError(res.status, typeof body.code === 'string' ? body.code : undefined, errorMessage(body, fallbackError), body);
  }
  return body;
}

/** Yanıttaki `version` alanını zorunlu kılar. */
export function requireVersion(body: JsonObject, field: string = 'version'): string {
  const v = body[field];
  if (typeof v !== 'string' || v.length === 0) {
    throw new HttpError(500, 'MISSING_VERSION', MISSING_VERSION_MESSAGE, body);
  }
  return v;
}

export type SaveVersionedResult =
  | { ok: true; body: JsonObject }
  | { ok: false; conflict: true; currentVersion: string | null; message: string };

/**
 * Kaydet yardımcısı. 409 `VERSION_CONFLICT` istisna DEĞİL, sonuçtur: çağıran çakışma bandını
 * gösterir. Diğer hatalar `HttpError` olarak fırlatılır.
 */
export async function saveVersioned(
  url: string,
  method: 'PUT' | 'PATCH' | 'POST',
  payload: unknown,
  fallbackError: string = 'Kaydedilemedi'
): Promise<SaveVersionedResult> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await parseJson(res);
  if (res.status === 409 && body.code === VERSION_CONFLICT_CODE) {
    return {
      ok: false,
      conflict: true,
      currentVersion: typeof body.currentVersion === 'string' ? body.currentVersion : null,
      message: errorMessage(body, fallbackError),
    };
  }
  if (!res.ok || body.success === false) {
    throw new HttpError(res.status, typeof body.code === 'string' ? body.code : undefined, errorMessage(body, fallbackError), body);
  }
  return { ok: true, body };
}

/** `components/states` QueryState'e verilecek ördek-tipli sorgu nesnesi. */
export function toQueryLike<T>(state: ResourceState<T>, refetch: () => unknown) {
  return {
    data: state.status === 'ready' ? state.data : null,
    isLoading: state.status === 'idle' || state.status === 'loading',
    isError: state.status === 'error',
    error: state.status === 'error' ? state.error : null,
    refetch,
  };
}

/** Kararlı imza (kirli-form tespiti için; anahtar sırasından bağımsız). */
export function signatureOf(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    const obj = v as Record<string, unknown>;
    return Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = walk(obj[k]);
        return acc;
      }, {});
  };
  return JSON.stringify(walk(value));
}

/**
 * Kirli alan farkı: yalnız `baseline`'dan farklı olan anahtarları döndürür. Kaydetmede yalnız
 * değişen alanlar gönderilir; dokunulmamış alanlar asla canlı değeri ezmez.
 */
export function diffFields<T extends Record<string, unknown>>(baseline: T, current: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(current) as Array<keyof T>) {
    if (signatureOf(current[key]) !== signatureOf(baseline[key])) out[key] = current[key];
  }
  return out;
}
